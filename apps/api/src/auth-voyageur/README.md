# Authentification du voyageur : code par SMS ou WhatsApp (AM-023)

« Ton numéro, c'est ton compte. » Le voyageur saisit son numéro, reçoit un code à 4 chiffres par SMS
(ou par WhatsApp), le tape (ou le navigateur le remplit seul) et obtient une session. Le compte naît
au premier code valide. Ce sont les deux routes de la planche **Connexion** (AM-021), que le client
d'API appelle avec `useDemanderCode` et `useVerifierCode` (`OP_DEMANDER_CODE`, `OP_VERIFIER_CODE`).

Le module est **autonome** : il s'appuie sur les services globaux du socle (configuration, audit,
comptes, jetons) et sur des **ports** (classes abstraites) livrés avec une version en mémoire. Il ne
touche ni `app.module.ts` ni `prisma/schema.prisma` : le coordinateur les branche (section « Intégration »).

## Routes

| Route                                   | Accès    | Corps → réponse (contrat `voyageur`)                                                                                              |
| --------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `POST /voyageur/connexion/code`         | publique | `DemandeCode { telephone, canal? }` → `ReponseDemandeCode { telephone, canal, longueurCode: 4, renvoiDansSecondes: 40, expireA }` |
| `POST /voyageur/connexion/verification` | publique | `VerificationCode { telephone, code }` → `SessionVoyageur { jeton, expireA, nouveauCompte, profil }`                              |

Les corps sont lus par `validation.ts`, miroir des schémas zod du contrat (`validation.test.ts` compare
les deux sur une table de cas). Les clés en trop sont ignorées : on ne choisit pas son rôle.

Erreurs : `{ code, message, details? }`, ce que lit l'adaptateur HTTP du client d'API.

| Statut | `code`                 | Quand                                                                                           |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------- |
| 400    | `REQUETE_INVALIDE`     | numéro mal formé, code qui n'a pas 4 chiffres                                                   |
| 401    | `CODE_INVALIDE`        | mauvais code ; `details.essaisRestants` (4, 3, 2, 1)                                            |
| 401    | `CODE_EXPIRE`          | pas de code en cours, code de plus de 5 minutes ou déjà utilisé                                 |
| 422    | `CANAL_INDISPONIBLE`   | canal `ussd` (il ne se demande pas depuis l'application)                                        |
| 422    | `NUMERO_NON_AUTORISE`  | indicatif hors de `AUTH_VOYAGEUR_INDICATIFS` (+237 par défaut)                                  |
| 429    | `ENVOI_TROP_RAPPROCHE` | moins de 40 s depuis le dernier envoi ; `Retry-After` et `details.renvoiDansSecondes`           |
| 429    | `TROP_DE_DEMANDES`     | 5 codes déjà demandés dans l'heure ; `Retry-After`                                              |
| 429    | `TROP_ESSAIS`          | numéro bloqué après 5 mauvais codes ; `Retry-After` (secondes), `details.reessayerDansSecondes` |
| 503    | `ENVOI_IMPOSSIBLE`     | ni WhatsApp ni SMS n'ont pu prendre le message ; le délai de 40 s ne court pas                  |

Le client d'API ne relance pas ces POST (opérations non idempotentes) et lit `Retry-After` dans
`ErreurHttp.reessayerApresMs`, ce que fait déjà la planche (`bloquer(...)` sur un 429).

## Règles métier

- **Code** : 4 chiffres tirés avec `crypto.randomInt`, valable **5 minutes**, **usage unique**. Seul son
  HMAC-SHA-256 (lié à l'identifiant du code, poivre `AUTH_PEPPER`) est rangé. Seul le **dernier** code
  demandé est valable : redemander invalide l'ancien.
- **Envois** : **1 par 40 s** et **5 par heure** pour un numéro (un SMS coûte 12 F). Un envoi qui échoue
  n'use ni le délai ni le quota (le code est retiré).
- **Essais** : **5 mauvais codes** (tous codes confondus) bloquent le numéro **15 minutes**, puis 30 min,
  1 h… jusqu'à 24 h si les erreurs reprennent aussitôt après chaque attente. Pendant le blocage, même le bon
  code est refusé et aucun code n'est envoyé. **Redemander un code ne remet pas le compteur à zéro**
  (sinon il suffirait de redemander pour retenter 5 fois sur 10 000 combinaisons). Une heure de calme efface
  les erreurs, 24 h les blocages, une connexion réussie tout.
- **Même réponse pour tous** : le numéro ait un compte ou non (ou un compte désactivé, ou un compte
  d'agence), la réponse est identique ; seul un compte éligible reçoit le SMS.
- **Compte** : une `Personne` du socle avec le seul rôle `voyageur`, créée à la première vérification
  réussie. Un numéro déjà inscrit comme guichetier, patron… ne peut pas ouvrir de session voyageur
  (même règle que `/auth/voyageur/*`). Le jeton est le JWT du socle (rôle actif `voyageur`).
- **WhatsApp** : si le canal n'est pas branché ou refuse, la demande part **par SMS** et la réponse dit
  `canal: "sms"` (l'écran affiche « code reçu par SMS »).
- **SMS au format WebOTP** : `AfriMove : ton code est 4821. Valable 5 min. Personne d'AfriMove ne te le
demandera jamais.` + ligne vide + `@afrimove.app #4821`. La dernière ligne est `@<domaine> #<code>`
  (`AUTH_VOYAGEUR_WEBOTP_DOMAINE` = l'hôte exact de la PWA). Sans accent : un seul « é » ferait passer le
  SMS en UCS-2 (70 caractères, 36 F au lieu de 12). Le test vérifie un seul morceau en alphabet GSM.
- **Le code n'est jamais journalisé en clair** : ni dans les journaux techniques, ni dans l'audit
  (actions `connexion.voyageur.*`, numéro réduit à une empreinte de 12 caractères), ni en base. Il n'existe
  que dans le message (chiffré dans la file de la passerelle SMS). Le simulateur n'écrit le texte que si
  `SMS_MOCK_LOG_CODES=true` (interdit en production). Testé (`connexion.service.test.ts`).

En plus des limites par numéro, chaque route accepte 10 requêtes par minute et par adresse IP
(`@Throttle`, comme `/auth/*`).

## Ports et adaptateurs

| Port (`ports.ts`)   | Rôle                                                                    | Par défaut                            | À brancher                                                    |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| `StockageConnexion` | codes émis, quota d'envois, essais et blocages (méthodes **atomiques**) | `StockageConnexionMemoire`            | adaptateur PostgreSQL (tables ci-dessous)                     |
| `FichesVoyageur`    | « inscrit depuis », langue, pièce vérifiée                              | `FichesVoyageurMemoire`               | adaptateur PostgreSQL                                         |
| `EnvoiCodeSms`      | envoi du texte par SMS                                                  | `EnvoiCodeSmsMemoire`                 | `EnvoiCodeSmsPasserelle` (fourni, sur `PasserelleSmsService`) |
| `EnvoiCodeWhatsApp` | envoi par WhatsApp (gabarit d'authentification)                         | `EnvoiCodeWhatsAppAbsent` (repli SMS) | à écrire quand le gabarit existe                              |
| `ComptesVoyageur`   | trouver / créer la personne du numéro                                   | `ComptesVoyageurSocle`                | (fourni, sur `ComptesService` du socle)                       |
| `EmetteurSession`   | jeton de session                                                        | `EmetteurSessionJwt`                  | (fourni, sur `TokensService` du socle)                        |

`VerificationAuthVoyageur` refuse de démarrer **en production** tant que le stockage ou les fiches sont en
mémoire ou que l'envoi par SMS est simulé (il les nomme tous). WhatsApp non branché n'empêche pas de
démarrer (avertissement).

`testing/contrat-stockage.ts` est le **test de contrat** de `StockageConnexion` : il tourne sur la mémoire
(`stockage.test.ts`) et doit tourner tel quel sur l'adaptateur PostgreSQL du coordinateur (quota et
blocage sous requêtes simultanées, usage unique du code).

## Configuration (variables d'environnement, toutes facultatives hors production)

| Variable                         | Défaut         | Rôle                                                                       |
| -------------------------------- | -------------- | -------------------------------------------------------------------------- |
| `AUTH_VOYAGEUR_WEBOTP_DOMAINE`   | `afrimove.app` | hôte de la dernière ligne du SMS ; **obligatoire en production**           |
| `AUTH_VOYAGEUR_INDICATIFS`       | `+237`         | indicatifs qui peuvent recevoir un code (SMS à l'étranger = fraude au SMS) |
| `AUTH_VOYAGEUR_CODE_TTL_S`       | `300`          | validité d'un code (60 à 900)                                              |
| `AUTH_VOYAGEUR_RENVOI_S`         | `40`           | délai entre deux envois                                                    |
| `AUTH_VOYAGEUR_ENVOIS_PAR_HEURE` | `5`            | envois par numéro et par heure                                             |
| `AUTH_VOYAGEUR_ESSAIS_MAX`       | `5`            | mauvais codes avant blocage                                                |
| `AUTH_VOYAGEUR_BLOCAGE_MIN`      | `15`           | premier blocage, doublé ensuite (plafond 24 h)                             |

Le poivre (`AUTH_PEPPER`), les clés JWT et `SMS_*` viennent du socle et de la passerelle SMS.

## Intégration (coordinateur : `app.module.ts`, Prisma)

1. **`AppModule`** : importer le module.
   ```ts
   AuthVoyageurModule.avec({
     imports: [SmsModule], // déjà dans AppModule ; exporte PasserelleSmsService
     providers: [
       { provide: StockageConnexion, useClass: StockageConnexionPrisma },   // à écrire (tables ci-dessous)
       { provide: FichesVoyageur, useClass: FichesVoyageurPrisma },          // à écrire
       { provide: EnvoiCodeSms, useClass: EnvoiCodeSmsPasserelle },          // fourni
       // { provide: EnvoiCodeWhatsApp, useClass: … },                       // quand le gabarit existe
     ],
   }),
   ```
   Les adaptateurs durables déclarent `durable = true` ; `EnvoiCodeSmsPasserelle` déclare `reel = true`.
   Le module n'a pas de bascule `API_STOCKAGE` : en mémoire tant qu'on ne fournit pas les adaptateurs.
2. **Migration** (hors de mon périmètre, `apps/api/prisma/**`) : ajouter les trois tables ci-dessous.
3. **Variables** : au moins `AUTH_VOYAGEUR_WEBOTP_DOMAINE` en production.
4. **Purge** : supprimer `code_connexion_voyageur` de plus de 24 h et `limite_connexion_voyageur` sans
   blocage ni erreur depuis 24 h (tâche planifiée).

### Tables PostgreSQL attendues

```sql
CREATE TABLE code_connexion_voyageur (
  id               uuid PRIMARY KEY,
  telephone_index  text        NOT NULL,   -- HMAC du numéro (regles.indexTelephone), jamais le numéro
  code_hache       text        NOT NULL CHECK (code_hache ~ '^[0-9a-f]{64}$'),   -- jamais le code
  canal            text        NOT NULL CHECK (canal IN ('sms','whatsapp')),
  cree_a           timestamptz NOT NULL,
  expire_a         timestamptz NOT NULL CHECK (expire_a > cree_a),
  consomme_a       timestamptz
);
CREATE INDEX code_connexion_voyageur_numero ON code_connexion_voyageur (telephone_index, cree_a DESC);

CREATE TABLE limite_connexion_voyageur (
  telephone_index  text PRIMARY KEY,
  echecs           integer     NOT NULL DEFAULT 0 CHECK (echecs >= 0),
  blocages         integer     NOT NULL DEFAULT 0 CHECK (blocages >= 0),
  bloque_jusqua    timestamptz,
  dernier_echec_a  timestamptz
);

CREATE TABLE fiche_voyageur (
  personne_id            uuid PRIMARY KEY REFERENCES personne (id),
  inscrit_a              timestamptz NOT NULL,
  langue                 text        NOT NULL DEFAULT 'fr' CHECK (langue IN ('fr','en')),
  piece_verifiee         boolean     NOT NULL DEFAULT false,
  piece_quatre_derniers  text        CHECK (piece_quatre_derniers ~ '^[0-9]{4}$')
);
```

Garanties à tenir par l'adaptateur `StockageConnexion` (le test de contrat les vérifie) :

- `reserverEnvoi` : une transaction qui prend `pg_advisory_xact_lock(hashtext(telephone_index))`, lit les
  `cree_a` du numéro sur la dernière heure, applique `decider(...)` (`regles.ts`) puis insère. Deux demandes
  simultanées ne dépassent ni 1 envoi par 40 s ni 5 par heure.
- `consommer` : `UPDATE … SET consomme_a = $2 WHERE id = $1 AND consomme_a IS NULL` ; une ligne modifiée =
  `true`. Le code est à usage unique même sous concurrence.
- `noterEchec` : même verrou par numéro (ou `SELECT … FOR UPDATE` sur `limite_connexion_voyageur` après
  `INSERT … ON CONFLICT DO NOTHING`), puis `appliquerEchec(...)` (`regles.ts`) et écriture. Un numéro déjà
  bloqué n'est pas modifié.
- `annulerEnvoi` : `DELETE` du code (jamais d'`UPDATE` du hachage).
- `FichesVoyageur.ouvrir` : `INSERT … ON CONFLICT (personne_id) DO NOTHING` puis lecture.

## À faire hors périmètre (à porter au coordinateur)

1. **WebOTP ne marchera pas de bout en bout tant que `apps/api/src/sms/gabarits.ts` n'est pas corrigé.**
   Le gabarit `systeme` (le seul qui accepte un texte libre) ramène les sauts de ligne à des espaces
   (`Lecteur.texte`) : le SMS arrive en une ligne et Chrome Android ne reconnaît plus `@domaine #code`,
   qui doit être la **dernière ligne**. Correctif : ajouter un type `code_connexion` (variables `code`,
   `domaine`, `minutes`, texte rendu avec le saut de ligne conservé, `sensible: true`, `validiteMs` 5 min)
   et l'utiliser dans `EnvoiCodeSmsPasserelle`. Le test `it.fails("le SMS arrive avec « @domaine #code » en
dernière ligne")` dans `auth-voyageur.module.test.ts` documente l'écart ; il échouera dès que le gabarit
   sera corrigé, il suffira alors d'ôter `.fails`. Sans correctif : la saisie manuelle et
   `autocomplete="one-time-code"` (Safari iOS, clavier Android) marchent.
2. **WhatsApp** : la passerelle (`apps/api/src/whatsapp`) n'a pas de gabarit de code. Il faut un gabarit de
   catégorie _authentification_ chez Meta (`afrimove_code`, bouton « copier le code »), un type `code`
   dans `whatsapp/gabarits.ts`, puis un adaptateur `EnvoiCodeWhatsApp` sur `PasserelleWhatsAppService.envoyer`
   (`branche = true`, `reel = true`, `cle = demande.cle`, `secours: false` : le repli SMS est géré ici).
3. **Adaptateurs PostgreSQL et migration** (section précédente).
4. **Routes `/auth/voyageur/*` du socle** (code à 6 chiffres, `defiId`) : elles font double emploi avec
   celles-ci et ne suivent pas le contrat voyageur. À retirer quand plus rien ne les appelle.

## Décisions à confirmer

- **Blocage 15 minutes, doublé jusqu'à 24 h.** Le front applique 60 s quand le serveur ne dit rien ; avec des
  codes à 4 chiffres, 60 s laisseraient environ 7 000 essais par jour. Inconvénient : quelqu'un qui connaît
  le numéro d'un voyageur peut le bloquer en tapant 5 mauvais codes (déni de service ciblé). Alternative :
  durée plus courte + vérification supplémentaire.
- **Un seul code valable à la fois.** Si le SMS lent arrive après le renvoi, l'ancien code est refusé.
- **Numéros du Cameroun seulement** (`+237`) par défaut, contre la fraude au SMS vers l'étranger. Les proches
  qui paient depuis l'étranger n'ont pas de compte voyageur ici ; élargir `AUTH_VOYAGEUR_INDICATIFS` au besoin.
- **Durée de session = `JWT_TTL_SECONDS` du socle (1 h par défaut)**, alors que le serveur de démonstration
  de la planche annonce 30 jours. Il n'y a ni jeton de rafraîchissement ni durée propre au rôle dans
  `TokensService` ; une session de 30 jours demande de l'ajouter (hors périmètre).
- **`inscritDepuis`** = première connexion par ces routes (`fiche_voyageur`). Un voyageur créé avant par
  `/auth/voyageur/*` reçoit la date de sa première connexion ici. `prenom`, `nom` et `initiales` sont vides
  jusqu'à ce qu'un autre écran (« Moi ») renseigne le nom.
- **`canal: "ussd"`** refusé en 422 : le code USSD (`*123#`) relève d'un autre ticket.
- **Coût** : un code = un SMS de 12 F, quota 5 par heure et par numéro, 10 requêtes par minute et par IP.
  Aucun plafond global de dépense n'existe encore (fraude au SMS en volume).
- **Brancher les écrans** (dernière tâche du ticket) : la planche Connexion (AM-021) utilise déjà ces deux
  opérations et les codes d'erreur ci-dessus ; `auth-voyageur.e2e.test.ts` exécute le vrai client d'API HTTP
  (`creerClientHttp`, `OP_DEMANDER_CODE`, `OP_VERIFIER_CODE`) contre cette API. Le changement d'adaptateur
  (mock → HTTP) dans l'application se fait par la configuration du client d'API, pas dans ce dossier.

## Tests

`pnpm --filter @afrimove/api run test` :

- `regles.test.ts` : code à 4 chiffres (zéros de tête), hachage, texte WebOTP (dernière ligne, un seul morceau GSM),
  comptage des essais et blocages (5, puis ×2, plafond, calme), décision d'envoi (40 s, 5 par heure).
- `validation.test.ts` : parité des lecteurs avec les schémas zod du contrat, configuration.
- `stockage.test.ts` + `testing/contrat-stockage.ts` : contrat du port (concurrence comprise) sur la mémoire.
- `connexion.service.test.ts` : le service sur les adaptateurs en mémoire et une horloge qu'on avance
  (envois, essais, blocages, usage unique, WhatsApp et repli, pannes, compte non éligible, **code absent des
  journaux, de l'audit et du stockage**).
- `auth-voyageur.e2e.test.ts` : HTTP complet avec la vraie application (gardes, audit, limitation par IP) et le
  vrai client d'API HTTP.
- `auth-voyageur.module.test.ts` : garde-fou de production, `AuthVoyageurModule.avec`, vraie passerelle SMS
  (dont l'écart WebOTP ci-dessus).
