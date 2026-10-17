# Passerelle SMS (AM-166)

Envoi des SMS d'AfriMove par un agrégateur : expéditeur « AfriMove », gabarits en français, file
compatible BullMQ, reprise sur échec, bascule sur un fournisseur de secours, statut de livraison
(accusés signés) et coût par type de SMS (12 F le morceau).

Construit **par-dessus** `apps/api/src/socle/sms/sms.gateway.ts`, qui n'est pas modifié : `SmsGateway`
(utilisé par l'authentification) reste l'interface des autres modules, et `SmsGatewayPasserelle` en est
l'implémentation branchée sur cette passerelle.

## Chemin d'un SMS

```
module métier ──► PasserelleSmsService.envoyer ──► JournalSms (message, sans texte)
 (billet, colis…)    valide le gabarit, le numéro,     FileEnvoiSms (numéro et texte chiffrés)
                     les limites, l'idempotence             │
                                                            ▼
                         TravailleurSms ──► traiter() ──► fournisseur principal ─┐ échec temporaire
                                                           └► fournisseur secours ◄┘ (même essai)
                                                            │ accepté : statut « envoyé », coût
                                      webhook signé ───────►│ ReceptionRecusService : « livré » / « non livré »
```

## Ce que le module fournit

| Élément                               | Rôle                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PasserelleSmsService`                | `envoyer(demande)` (tous les modules), `envoyerBillet` (guichet, idempotent, renvois limités), `annuler`, `obtenir`, `etat`, `traiter` (un essai d'envoi).    |
| `gabarits.ts`                         | Un gabarit par type : `billet`, `code_retrait`, `alerte_proche`, `retard`, `pin_provisoire`, `systeme`. Variables validées, texte adapté à l'alphabet GSM.    |
| `gsm.ts`                              | Encodage (GSM 160/153, UCS-2 70/67), découpage en morceaux, `adapterGsm` (ê → e…), masquage des numéros.                                                      |
| `FournisseurSms` (port)               | `envoyer` + `lireRecus` (accusés signés). Adaptateurs : `FournisseurSimule` (programmable), `FournisseurHttp` (agrégateur JSON, `TransportHttp` remplaçable). |
| `RegistreFournisseurs`, `Disjoncteur` | Principal puis secours ; après 3 échecs d'affilée un fournisseur est coupé 30 s, puis retesté par un appel unique.                                            |
| `FileEnvoiSms` (port)                 | Forme de BullMQ (`add`, `Worker`, `Job`, `UnrecoverableError`). `FileEnvoiMemoire` : jobId idempotent, délai, priorité, attente exponentielle, concurrence.   |
| `JournalSms` (port)                   | Messages et essais. `JournalMemoire` en mémoire ; **la version PostgreSQL reste à écrire** (tables ci-dessous).                                               |
| `ReceptionRecusService`               | Accusés de livraison : signature HMAC, désordre et doublons tolérés, jamais de retour en arrière.                                                             |
| `StatistiquesSmsService`              | Coût, morceaux, perdus et délai médian par type ; objectif « médiane < 5 s ».                                                                                 |
| `SmsController`                       | Routes ci-dessous.                                                                                                                                            |
| `SmsModule`                           | Assemble tout. Refuse de démarrer en production tant que le journal ou la file sont en mémoire, ou que le fournisseur principal est simulé.                   |

## Statuts de livraison

`en_file` → `envoye` (accepté par le fournisseur, facturé) → `livre` | `non_livre` (accusé de l'opérateur).
`en_file` → `en_reprise` (un essai a échoué, le suivant est programmé) → … → `echec`.
`expire` (le message n'a plus de sens : PIN après 1 h, code de connexion après 5 min), `annule`.

Un accusé ne fait jamais reculer un message ; un statut `livre` ou `non_livre` est définitif. Un accusé
« livré » sur un message vu en échec (réponse perdue) fait foi et le facture.

## Reprise sur échec

- **Par essai** : le fournisseur principal, puis le secours dans le même essai (pas d'attente) ; un
  fournisseur « ouvert » par le disjoncteur est sauté.
- **Entre les essais** : 6 essais, attente 3 s, 6 s, 12 s, 24 s, 48 s (`SMS_TENTATIVES_MAX`,
  `SMS_REPRISE_MS`). Un refus définitif du fournisseur (numéro invalide) n'est pas réessayé.
- **Pas de double envoi ni de double facture** : la référence envoyée au fournisseur est l'identifiant
  du message ; si la réponse se perd, le réessai porte la même référence (le fournisseur doit répondre
  avec le même identifiant, en-tête `Idempotency-Key` pour `FournisseurHttp`). Le coût n'est écrit
  qu'à l'acceptation.
- **Mode dégradé** : `GET /sms/etat` rend `normal`, `secours` ou `indisponible`. Chaque bascule est
  journalisée (niveau `warn`), un échec définitif l'est en `error` et au journal d'audit
  (`sms.echec`). Plus aucun fournisseur : les messages restent en `en_reprise` et repartent seuls.

## Routes

| Route                                 | Rôles                                                   | Rôle de la route                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /sms/billets`                   | guichetier, convoyeur, vendeur, superviseur             | Envoi du billet à la demande (202). `{ billetId, telephone, renvoi?, compagnie, origine, destination, departA, siege, code, lien }`.         |
| `GET /sms/messages/:id`               | idem + patron, afrimove                                 | Statut, coût, délai, essais. Le terrain voit ses envois, superviseur et patron ceux de leur compagnie, AfriMove tout ; sinon 404.            |
| `GET /sms/billets/:billetId`          | idem                                                    | SMS d'un billet (statut de livraison à côté du billet).                                                                                      |
| `GET /sms/couts?du=&au=&compagnieId=` | afrimove (toutes), patron et comptable (leur compagnie) | Coût et délai par type, totaux, objectif de délai. `du` inclus, `au` exclu (`AAAA-MM-JJ` en heure de Douala ou date-heure avec fuseau).      |
| `GET /sms/etat`                       | afrimove                                                | Mode de la passerelle, circuit de chaque fournisseur, file.                                                                                  |
| `POST /sms/webhooks/:fournisseur`     | publique, authentifiée par signature                    | Accusés de livraison. `x-sms-horodatage` (secondes) + `x-sms-signature` = HMAC-SHA-256 hex de `<horodatage>.<corps exact>`, tolérance 5 min. |

Envoyer deux fois le même billet au même numéro ne renvoie rien (`nouveau: false`) ; `renvoi: true`
envoie un autre SMS (facturé), 2 renvois au plus (`SMS_RENVOIS_BILLET_MAX`) puis 429.

**Limites anti-abus** (SMS payants) : 60 SMS par compte et par heure, 10 par numéro et par heure
(hors codes de connexion), liens limités aux domaines de `SMS_HOTES_LIENS`, noms sans adresse web.

## Intégration (coordinateur : `app.module.ts`, `main.ts`, Prisma)

1. **`AppModule`** : importer `SmsModule` ; dans `AuthModule`, remplacer `{ provide: SmsGateway, useClass: SmsMock }` par `{ provide: SmsGateway, useExisting: SmsGatewayPasserelle }` (après avoir importé `SmsModule`). Contrairement à `SmsMock`, `SmsGatewayPasserelle.envoyer` met le message en file au lieu de lever une erreur en cas d'échec (voir la décision plus bas).
2. **`main.ts`** : `NestFactory.create(AppModule, { rawBody: true, … })`. Sans le corps brut, le webhook répond 401 (il ne peut pas vérifier la signature) et journalise l'erreur.
3. **Adaptateurs de production** (les ports sont prêts, les versions durables sont à écrire) :
   - `JournalSms` sur PostgreSQL (tables ci-dessous) ;
   - `FileEnvoiSms` sur BullMQ + Redis : `queue.add(nom, donnees, options)` et `new Worker(nom, processeur, { concurrency })` reprennent les signatures du port (correspondance en tête de `file.ts`). Garder `removeOnComplete`/`removeOnFail` courts : la charge utile est chiffrée mais inutile une fois envoyée.
4. **Variables d'environnement** : `SMS_FOURNISSEUR=http`, `SMS_API_URL`, `SMS_API_KEY`, `SMS_WEBHOOK_SECRET` (32 caractères au moins), `SMS_HOTES_LIENS` (obligatoire en production), éventuellement `SMS_SECOURS_*` ; réglages : `SMS_EXPEDITEUR`, `SMS_COUT_SEGMENT_FCFA`, `SMS_TENTATIVES_MAX`, `SMS_REPRISE_MS`, `SMS_CONCURRENCE`, `SMS_DISJONCTEUR_SEUIL`, `SMS_DISJONCTEUR_OUVERTURE_MS`, `SMS_LIMITE_*`. La liste complète et les règles de production sont dans `config.ts` ; le démarrage échoue en listant toutes les erreurs. `SMS_DRIVER` du socle ne sert plus.
5. **Ajuster `FournisseurHttp`** à l'agrégateur retenu (format JSON, codes d'erreur, format des accusés dans `lireCorpsRecus`) ; c'est le seul endroit qui connaît son API.
6. **Écrans** (tâche « brancher les écrans concernés », hors périmètre ici) : bouton « + numéro · envoyer le SMS » (`POST /sms/billets`), statut de livraison (`GET /sms/billets/:id`), tableau des coûts de l'administration (`GET /sms/couts`).

Les autres modules appellent `PasserelleSmsService.envoyer({ type, variables, destinataire, cle?, reference?, compagnieId?, envoyerA? })` :
la `cle` rend l'appel idempotent (ex. `retrait:<colisId>`), `envoyerA` programme l'alerte au proche 15 minutes avant l'arrivée, `annuler(id)` la retire si le bus est déjà arrivé.

## Tables PostgreSQL attendues (hors périmètre : `apps/api/prisma/**`)

```sql
CREATE TABLE sms_message (
  id                   uuid PRIMARY KEY,
  type                 text        NOT NULL CHECK (type IN ('billet','code_retrait','alerte_proche','retard','pin_provisoire','systeme')),
  cle                  text        NOT NULL UNIQUE,            -- idempotence : INSERT … ON CONFLICT (cle) DO NOTHING
  reference_type       text,
  reference_id         text,
  compagnie_id         uuid,
  demandeur_id         uuid,
  destinataire_chiffre text        NOT NULL,                   -- ChiffrementService, contexte « sms.destinataire:<id> »
  destinataire_index   text        NOT NULL,                   -- index aveugle (limites par numéro)
  destinataire_masque  text        NOT NULL,
  expediteur           text        NOT NULL,
  statut               text        NOT NULL CHECK (statut IN ('en_file','en_reprise','envoye','livre','non_livre','echec','expire','annule')),
  encodage             text        NOT NULL CHECK (encodage IN ('gsm7','ucs2')),
  caracteres           integer     NOT NULL,
  segments             integer     NOT NULL CHECK (segments BETWEEN 1 AND 3),
  cout_fcfa            integer     NOT NULL DEFAULT 0,         -- écrit à l'acceptation par le fournisseur
  cout_estime_fcfa     integer     NOT NULL,
  tentatives           integer     NOT NULL DEFAULT 0,
  fournisseur          text,
  id_fournisseur       text,
  derniere_erreur      text,                                   -- code court, jamais de texte du message
  cree_a               timestamptz NOT NULL,
  planifie_a           timestamptz,
  expire_a             timestamptz,
  envoye_a             timestamptz,
  livre_a              timestamptz,
  delai_envoi_ms       integer
);
CREATE UNIQUE INDEX sms_message_fournisseur ON sms_message (fournisseur, id_fournisseur) WHERE id_fournisseur IS NOT NULL;
CREATE INDEX sms_message_compagnie_date ON sms_message (compagnie_id, cree_a DESC);
CREATE INDEX sms_message_reference      ON sms_message (reference_type, reference_id);
CREATE INDEX sms_message_demandeur      ON sms_message (demandeur_id, cree_a);
CREATE INDEX sms_message_destinataire   ON sms_message (destinataire_index, cree_a);

CREATE TABLE sms_essai (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id  uuid        NOT NULL REFERENCES sms_message (id),
  numero      integer     NOT NULL,
  fournisseur text        NOT NULL,
  at          timestamptz NOT NULL,
  duree_ms    integer     NOT NULL,
  resultat    text        NOT NULL CHECK (resultat IN ('accepte','temporaire','definitif')),
  code        text
);
CREATE INDEX sms_essai_message ON sms_essai (message_id, id);
```

- `JournalSms.modifier(id, modifs, seulementSi)` : `UPDATE … WHERE id = $1 AND statut = ANY($2)` ; zéro ligne = `null`. C'est ce qui garde les statuts cohérents quand un accusé et un réessai se croisent.
- `JournalSms.compter` et `lister` : requêtes à index ; pour `StatistiquesSmsService`, remplacer l'agrégation en mémoire par `GROUP BY type` et `percentile_cont(0.5)` quand le volume le demande.
- Le texte des SMS n'est **jamais** stocké dans ces tables.

## Confidentialité

Le texte d'un SMS peut porter un code, un PIN ou un lien personnel : il n'existe que **chiffré** (AES-GCM,
contexte lié à l'identifiant du message) dans la charge utile de la file, avec le numéro. Le journal ne
garde que le numéro chiffré, son index aveugle et une version masquée (`+237 ••••• 345`). Les journaux
techniques et l'audit ne contiennent ni numéro ni texte (testé). Le simulateur n'écrit le texte que si
`SMS_MOCK_LOG_CODES=true`, interdit en production.

## Limites et décisions à confirmer

- **Coût au morceau, pas au message.** « 12 F / SMS » est appliqué à chaque morceau (160 caractères GSM, 70 en UCS-2). Les gabarits tiennent en un morceau avec des valeurs courantes ; un billet aux noms très longs en coûte deux. À confirmer avec le tarif de l'agrégateur, ainsi que la facturation des SMS « non livrés » (comptés ici).
- **Accents.** `ê î ô û ï ç œ « »` n'existent pas dans l'alphabet GSM ; ils sont remplacés par leur lettre simple (« Bêta » → « Beta ») pour ne pas tripler le prix. À valider côté marque (noms de compagnies).
- **Expéditeur alphanumérique** « AfriMove » : certains opérateurs (MTN, Orange Cameroun) imposent un enregistrement préalable de l'identifiant ; sans lui, le fournisseur peut le remplacer par un numéro.
- **`SmsGatewayPasserelle` ne lève plus** en cas d'échec d'envoi (le contrat d'origine le demande) : le message est repris par la file, puis journalisé et audité. Un code de connexion devient caduc après 5 minutes. Si l'authentification doit échouer tout de suite quand aucun SMS ne peut partir, il faut un mode « synchrone » (non fait).
- **Qui voit les coûts.** AfriMove (toutes les compagnies), patron et comptable (leur compagnie). Si les SMS sont à la charge d'AfriMove seul, retirer patron et comptable de `ROLES_COUTS`.
- **Disjoncteur par processus** : chaque instance de l'API apprend seule l'état d'un fournisseur.
- **Délai médian < 5 s** : la mesure (demande → acceptation par le fournisseur) est en place et testée avec le simulateur ; elle n'a pas pu être vérifiée sur un vrai agrégateur (pas d'accès réseau ni de compte sandbox). La remise au téléphone dépend de l'opérateur.
- **Alertes au proche et retard** : la passerelle sait les programmer et les envoyer ; le calcul « 15 minutes avant l'arrivée » et la liste des voyageurs d'un retard appartiennent aux modules de suivi du bus.
- **Billet envoyé par le guichet** : la route reçoit le contenu du billet (compagnie, trajet, siège, code, lien). Elle ne peut pas le comparer au billet réel tant que le module des billets n'existe pas ; le garde-fou est le gabarit fixe, les limites et l'audit (`sms.billet_demande`).

## Tests

`pnpm --filter @afrimove/api run test` — `gsm.test.ts`, `gabarits.test.ts` (textes exacts, validation, heure de Douala),
`file-memoire.test.ts` (comportement BullMQ), `fournisseurs.test.ts` (simulateur, client HTTP, signatures),
`passerelle.service.test.ts` (envoi, idempotence, limites, reprises, secours, disjoncteur, expiration,
annulation, confidentialité), `reception.service.test.ts` (accusés), `statistiques.service.test.ts`
(coût par type, délai), `config.test.ts`, `sms.module.test.ts` (garde-fou de production, `SmsGateway`),
`sms.e2e.test.ts` (HTTP : rôles, périmètre, webhook signé avec corps brut, audit).
Le montage sans Nest (`testing/montage.ts`) fait avancer l'horloge : aucun test n'attend en vrai.
