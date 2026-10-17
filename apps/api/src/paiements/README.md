# Paiements (AM-165)

Paiement en ligne des commandes par un agrégateur : MTN Mobile Money, Orange Money et cartes. Le prix du
billet est reversé **à la compagnie**, les frais de service **à AfriMove**, sur deux lignes séparées
envoyées à l'agrégateur (AfriMove ne détient jamais le prix d'un billet). Un webhook rejoué ne crée jamais
deux jeux de billets. Si l'agrégateur est indisponible, le mode dégradé laisse réserver en ligne et payer à
la gare.

Le module appelle la billetterie par ses ports et par `CommandesService.confirmerPaiement`, la passerelle
SMS par `PasserelleSmsService.envoyer` ; **il ne modifie ni l'un ni l'autre**, ni `app.module.ts`, ni le
schéma Prisma.

## Chemin d'un paiement

```
voyageur ──► POST /voyageur/commandes/:id/paiements ──► PaiementsService
  (ou proche, lien)                                       │ répartition prix / frais, compte de la compagnie
                                                          │ ouvrir (1 paiement en attente par commande)
                                                          ▼
                                   GardeAgregateur ──► AgregateurPaiement.initier (référence = id du paiement)
                                    (disjoncteur)          │ « en attente » : le client confirme sur son téléphone
                                                           ▼
agrégateur ──► POST /paiements/webhooks/:nom (signé) ──► EncaissementsService.traiterNotifications
                                                          │ événement déjà vu ? ignoré
                                                          │ transitionner en_attente → reussi (comparer et remplacer)
                                                          │ montant différent ? aucun billet, anomalie journalisée
                                                          ▼
                                       commande déjà confirmée par un autre paiement ?
                                         oui → « doublon » : remboursement intégral
                                         non → CommandesService.confirmerPaiement → billets (1 seul jeu)
                                               places reprises / commande annulée → remboursement intégral
```

Rien n'est perdu si le webhook manque : `BalayagePaiements` (toutes les 30 s) interroge l'agrégateur pour
les paiements restés « en attente » plus de 20 s, passe à « expiré » ceux dont le délai est écoulé, reprend
les commandes restées à confirmer et les remboursements qui n'ont pas pu partir. Un paiement arrivé après
son expiration est quand même accepté (l'argent a bougé) ; si les places sont reprises, il est remboursé.

### Garanties contre le double paiement

| Risque                                                       | Garde                                                                                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Même webhook reçu deux fois (ou en même temps)               | Identifiant d'événement mémorisé **après** traitement ; sinon `transitionner` refuse un paiement déjà reçu.                |
| Même issue sous un autre identifiant d'événement             | `transitionner(en_attente/expire/echoue → reussi)` : le second passage ne fait rien.                                       |
| Deux paiements réussis pour la même commande                 | `Paiements.confirmer` (index unique `(commande_id) WHERE confirmation = 'faite'`) : le second est remboursé (« doublon »). |
| Deux paiements en cours pour la même commande                | `Paiements.ouvrir` (index unique `(commande_id) WHERE statut = 'en_attente'`) : 409 `PAIEMENT_EN_COURS`.                   |
| Double clic, réponse perdue, nouvel essai                    | La référence envoyée à l'agrégateur est l'identifiant du paiement ; il dédoublonne (`Idempotency-Key`).                    |
| Deux remboursements qui dépassent ensemble le paiement       | `Remboursements.ajouter` (une transaction) : plafond **par bénéficiaire**, clé d'idempotence unique.                       |
| Confirmation de la billetterie en panne après l'encaissement | Paiement « reçu, billets à émettre » (`confirmation = a_faire`) : le balayage et le rejeu du webhook finissent le travail. |

`Verrous` (un verrou par commande, dans le processus) évite des allers-retours inutiles ; **l'exactitude
repose sur les ports** (comparer et remplacer, index uniques), donc plusieurs instances de l'API sont sûres
dès que les adaptateurs PostgreSQL appliquent ces contraintes.

## Qui reçoit quoi

`repartir()` (règles pures, testées) coupe la commande en lignes de reversement : tout ce qui n'est pas la
ligne `frais_voyageur` (billet, bagage, supplément) va au compte de la **compagnie** ; les frais de service
vont au compte **AfriMove** (`PAIEMENTS_COMPTE_AFRIMOVE`). Frais offerts (code promotionnel) : une seule
ligne. Une compagnie sans compte de reversement (`PUT /paiements/comptes-reversement/:id`) ne peut pas être
payée en ligne (422 `COMPAGNIE_SANS_COMPTE`) : refuser vaut mieux qu'encaisser à sa place.

Les remboursements suivent la même règle : le prix rendu vient de la part de la compagnie, les frais rendus
de la part d'AfriMove, jamais au-delà de ce que chacun a reçu.

## Routes

Réponses suivant les schémas `voyageur` de `@afrimove/contrats` (comparés dans `contrats.test.ts`).

| Route                                             | Rôles                                                 | Rôle de la route                                                                                                                           |
| ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /voyageur/paiements/moyens`                  | voyageur                                              | MTN, Orange Money, carte, « demander à un proche » ; liste vide en mode dégradé.                                                           |
| `POST /voyageur/commandes/:id/paiements`          | voyageur                                              | Payer. `{ moyen, telephone?, jetonCarte? }`. 201 ; 422 `NUMERO_DE_CARTE_REFUSE` ; 409 `PAIEMENT_EN_COURS` ; 503 `MODE_DEGRADE`.            |
| `GET /voyageur/paiements/:id`                     | voyageur (le sien)                                    | Statut ; interroge l'agrégateur si le webhook tarde.                                                                                       |
| `POST /voyageur/commandes/:id/lien-proche`        | voyageur                                              | Lien de paiement pour un proche (`procheId` ou `telephone` : envoyé par SMS).                                                              |
| `GET /paiements/liens/:jeton`                     | publique (jeton du lien)                              | Aperçu : trajet, lignes, total, prénom du voyageur.                                                                                        |
| `POST /paiements/liens/:jeton/paiements`          | publique                                              | Le proche paie, sans compte. 410 `LIEN_EXPIRE`, 404 `LIEN_INCONNU`.                                                                        |
| `GET /paiements/liens/:jeton/paiements/:id`       | publique                                              | Suivi du paiement fait depuis le lien.                                                                                                     |
| `POST /paiements/guichet`                         | guichetier, convoyeur, vendeur, superviseur           | Push MoMo / Orange Money au guichet : tout va à la compagnie ; `cle` = idempotence.                                                        |
| `GET /paiements/guichet/:id`                      | idem                                                  | Statut ; `referenceOperateur` une fois reçu.                                                                                               |
| `GET /paiements/commandes/:id`                    | guichetier, vendeur, superviseur                      | Commande réservée à encaisser à la gare (sa compagnie).                                                                                    |
| `POST /paiements/commandes/:id/encaissement`      | guichetier, vendeur, superviseur                      | Mode dégradé seulement (409 `MODE_NORMAL`) : espèces ou MoMo marchand (`reference` obligatoire). Billets émis comme en ligne.              |
| `GET /paiements/mode`                             | tout compte connecté                                  | `{ degrade, raison, consigne }` : de quoi afficher « paie à la gare ».                                                                     |
| `PUT /paiements/mode-degrade`                     | afrimove                                              | Activer / couper le mode dégradé `{ actif, motif? }` (audité).                                                                             |
| `GET /paiements/etat`                             | afrimove                                              | Agrégateur, circuit (ouvert / fermé, échecs d'affilée), mode.                                                                              |
| `PUT /paiements/comptes-reversement/:compagnieId` | afrimove                                              | Compte de la compagnie chez l'agrégateur (`compteId: null` le retire).                                                                     |
| `GET /paiements/references?du=&au=&compagnieId=`  | afrimove (toutes), patron, comptable (leur compagnie) | Paiements avec références opérateur, répartition, remboursé : rapprochement. Numéros masqués.                                              |
| `POST /paiements/:id/remboursements`              | afrimove                                              | Remboursement manuel `{ montantCompagnie, montantAfrimove, motif, cle }`. 409 `REMBOURSEMENT_SUPERIEUR_AU_PAIEMENT`.                       |
| `POST /paiements/webhooks/:fournisseur`           | publique, signée                                      | Notifications de l'agrégateur. `x-paiement-horodatage` + `x-paiement-signature` = HMAC-SHA-256 hex de `<horodatage>.<corps exact>`, 5 min. |

Le webhook répond 200 (même pour un doublon ou un paiement inconnu : inutile de relancer), 401 si la
signature ou l'horodatage est faux, 404 pour un agrégateur inconnu, 400 pour un corps mal formé, 500 si
notre côté échoue (l'agrégateur renvoie alors le lot).

## Cartes : jamais de numéro chez nous

Le client envoie `jetonCarte`, produit par le prestataire (champs hébergés). Un numéro de carte (Luhn,
avec ou sans espaces) est refusé net (422), jamais transmis, stocké ni journalisé ; le jeton n'est ni
stocké ni audité. L'adresse 3-D Secure rendue par l'agrégateur est renvoyée telle quelle
(`urlAuthentification`, https seulement). Carte étrangère : `commande.conversion` (devise du payeur,
montant approximatif) est transmise à l'agrégateur ; `ConversionDevisesPaiements` donne le taux du jour.

## Confidentialité

Le numéro MoMo / Orange est chiffré (`ChiffrementService`, contexte `paiement.telephone:<id>`), montré
masqué (`+237 ••••• 345`) et absent des journaux et de l'audit (testé). Le lien envoyé à un proche porte un
jeton de 256 bits dont seul le SHA-256 est gardé ; il expire avec la commande (15 min) et un nouveau lien
révoque le précédent.

## Mode dégradé

Actif quand : AfriMove l'a coupé (`PUT /paiements/mode-degrade`), `PAIEMENTS_MODE_DEGRADE=true` (tant qu'aucun
réglage n'a été enregistré), aucun agrégateur n'est configuré, ou le circuit est ouvert (3 échecs
d'affilée, ouvert 30 s puis retesté par un appel unique). Le voyageur réserve toujours en ligne ; l'écran lit
`GET /paiements/mode`, affiche la consigne et le guichetier encaisse (`POST …/encaissement`). Les paiements
« à la gare » n'appellent jamais l'agrégateur : l'agence garde l'argent (les frais de service sont consignés
dans la répartition) et rend elle-même la monnaie en cas de problème (409 `SIEGES_PERDUS`).

## Ports et adaptateurs

`ports.ts` déclare des classes abstraites ; `memoire.ts` en donne les versions en mémoire (`durable = false`).
`PaiementsModule` **refuse de démarrer en production** tant qu'un port de stockage est en mémoire.

| Port                                                                                                               | À fournir par                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Paiements`, `Remboursements`, `NotificationsTraitees`, `LiensPaiement`, `ComptesReversement`, `ReglagesPaiements` | **Intégration** : versions PostgreSQL (tables ci-dessous).                                                                          |
| `AgregateurPaiement`                                                                                               | `AgregateurSimule` (développement, tests), `AgregateurHttp` (client JSON générique), `AgregateurAbsent` (par défaut en production). |
| `CommandesAPayer`, `NotifieurPaiements`, `AnnuaireVoyageurs`                                                       | Fournis (`adaptateurs.ts`) par-dessus la billetterie, la passerelle SMS et les comptes.                                             |

`AgregateurHttp` a un format **générique** (commenté en tête du fichier : `POST /encaissements`,
`GET /encaissements/{reference}`, `POST /remboursements`, `GET /taux/{devise}`, `Authorization: Bearer`,
`Idempotency-Key`). Il se règle sur l'agrégateur retenu : seuls `agregateur-http.ts` et
`lireCorpsNotifications` (dans `agregateur.ts`) connaissent son format. Le transport (`TransportPaiement`)
est remplaçable : aucun test ne touche le réseau.

## Intégration (coordinateur : `app.module.ts`, `main.ts`, Prisma)

1. **`AppModule`** : importer `PaiementsModule` (il importe déjà `BilletterieModule` et `SmsModule`).
2. **`main.ts`** : `NestFactory.create(AppModule, { rawBody: true, … })` (déjà demandé par le module SMS). Sans
   corps brut, le webhook répond 401 et journalise l'erreur.
3. **Adaptateurs PostgreSQL** pour les six ports de stockage, à brancher dans `paiements.module.ts` à la
   place des six `useClass: …Memoire`. Les contraintes qui garantissent « un seul jeu de billets » sont
   indispensables (index uniques et comparer-et-remplacer).
4. **Taux de change** : dans `BilletterieModule`, remplacer `ConversionMemoire` (taux indicatifs) par
   `{ provide: ConversionDevises, useExisting: ConversionDevisesPaiements }`.
5. **Écoute des annulations** : le module enveloppe `AvisBillets.publier` au démarrage
   (`AbonnementAvisBilletterie`) pour rembourser un billet annulé. Si l'intégration préfère composer les
   écouteurs elle-même (`composerAvis` dans `avis.ts`), mettre `PAIEMENTS_ABONNER_AVIS=false`.
6. **Variables d'environnement** : `PAIEMENTS_FOURNISSEUR` (`http`, `simule` hors production, `aucun` par défaut en
   production), `PAIEMENTS_FOURNISSEUR_NOM` (clé de l'URL du webhook, défaut `agregateur`), `PAIEMENTS_API_URL`
   (https), `PAIEMENTS_API_KEY` (16 caractères au moins), `PAIEMENTS_WEBHOOK_SECRET` (32 au moins),
   `PAIEMENTS_COMPTE_AFRIMOVE`, `PAIEMENTS_URL_LIEN_PROCHE` (obligatoire en production). Réglages :
   `PAIEMENTS_DELAI_MOBILE_MS` (180 000), `PAIEMENTS_DELAI_CARTE_MS` (600 000), `PAIEMENTS_DELAI_AGREGATEUR_MS`
   (10 000), `PAIEMENTS_CONSULTATION_APRES_MS` (20 000), `PAIEMENTS_BALAYAGE_MS` (30 000 ; 0 = pas de minuterie),
   `PAIEMENTS_DISJONCTEUR_SEUIL` (3), `PAIEMENTS_DISJONCTEUR_OUVERTURE_MS` (30 000),
   `PAIEMENTS_REMBOURSEMENT_ESSAIS_MAX` (8), `PAIEMENTS_REMBOURSEMENT_REPRISE_MS` (30 000),
   `PAIEMENTS_MODE_DEGRADE`, `PAIEMENTS_ABONNER_AVIS`, `PAIEMENTS_SIMULE_ISSUE` (`reussi` par défaut en
   développement). La liste, les bornes et les règles de production sont dans `config.ts` ; le démarrage échoue
   en listant toutes les erreurs.
7. **Comptes de reversement** : ouvrir un sous-compte par compagnie chez l'agrégateur, puis
   `PUT /paiements/comptes-reversement/:compagnieId` ; sans cela, aucune compagnie n'est payable en ligne.
8. **Ajuster `AgregateurHttp`** à l'agrégateur retenu (tâche « compte et accès sandbox »).
9. **Écrans** : le canal temps réel `paiement:<id>` est publié (message `MessageStatutPaiement` du contrat) mais
   la passerelle WebSocket de la billetterie ne sert que `sieges:` et `quai:` ; en attendant, l'écran suit
   `GET /voyageur/paiements/:id` (qui interroge l'agrégateur si besoin).

## Tables PostgreSQL attendues (hors périmètre : `apps/api/prisma/**`)

```sql
CREATE TABLE paiement (
  id                   uuid PRIMARY KEY,
  cle                  text UNIQUE,                                 -- idempotence (guichet : événement de vente ; agence : agence:<commande>)
  origine              text        NOT NULL CHECK (origine IN ('voyageur','proche','guichet','agence')),
  commande_id          uuid,
  voyageur_id          uuid,
  compagnie_id         uuid        NOT NULL,
  moyen                text        NOT NULL CHECK (moyen IN ('mtn_momo','orange_money','carte','especes_agence','momo_marchand')),
  operateur            text        CHECK (operateur IN ('mtn','orange')),
  montant              integer     NOT NULL CHECK (montant > 0),    -- FCFA
  devise_code          text,                                        -- carte étrangère
  devise_montant_mineur integer,
  repartition          jsonb       NOT NULL,                        -- [{ beneficiaire, compteId, montant }]
  statut               text        NOT NULL CHECK (statut IN ('en_attente','reussi','echoue','expire')),
  confirmation         text        NOT NULL CHECK (confirmation IN ('sans_objet','a_faire','faite','sieges_perdus','commande_annulee','doublon')),
  telephone_chiffre    text,                                        -- ChiffrementService, contexte « paiement.telephone:<id> »
  telephone_masque     text,
  fournisseur          text,
  id_fournisseur       text,
  reference_operateur  text,                                        -- rapprochement comptable
  url_authentification text,
  cause                text,                                        -- code court, jamais de texte du fournisseur
  billet_ids           uuid[]      NOT NULL DEFAULT '{}',
  cree_a               timestamptz NOT NULL,
  expire_a             timestamptz NOT NULL,
  termine_a            timestamptz
);
CREATE UNIQUE INDEX paiement_un_en_cours   ON paiement (commande_id) WHERE statut = 'en_attente' AND commande_id IS NOT NULL;
CREATE UNIQUE INDEX paiement_une_confirmee ON paiement (commande_id) WHERE confirmation = 'faite';
CREATE UNIQUE INDEX paiement_fournisseur   ON paiement (fournisseur, id_fournisseur) WHERE id_fournisseur IS NOT NULL;
CREATE INDEX paiement_balayage             ON paiement (cree_a) WHERE statut = 'en_attente';
CREATE INDEX paiement_a_confirmer          ON paiement (cree_a) WHERE statut = 'reussi' AND confirmation = 'a_faire';
CREATE INDEX paiement_compagnie_date       ON paiement (compagnie_id, cree_a DESC);
CREATE INDEX paiement_commande             ON paiement (commande_id);

CREATE TABLE paiement_remboursement (
  id                  uuid PRIMARY KEY,
  paiement_id         uuid        NOT NULL REFERENCES paiement (id),
  cle                 text        NOT NULL UNIQUE,                  -- billet-annule:<billet>, afrimove:<cle>, doublon_paiement:<paiement>…
  cause               text        NOT NULL CHECK (cause IN ('billet_annule','depart_annule','sieges_perdus','commande_annulee','doublon_paiement','demande_afrimove')),
  billet_id           uuid,
  lignes              jsonb       NOT NULL,                         -- [{ beneficiaire, montant }]
  montant             integer     NOT NULL CHECK (montant > 0),
  statut              text        NOT NULL CHECK (statut IN ('demande','reussi','echoue')),
  id_fournisseur      text,
  reference_operateur text,
  tentatives          integer     NOT NULL DEFAULT 0,
  prochain_essai_a    timestamptz,
  derniere_erreur     text,
  cree_a              timestamptz NOT NULL,
  termine_a           timestamptz
);
CREATE INDEX paiement_remboursement_paiement ON paiement_remboursement (paiement_id);
CREATE INDEX paiement_remboursement_reprise  ON paiement_remboursement (prochain_essai_a) WHERE statut = 'demande';

CREATE TABLE paiement_notification (
  fournisseur  text        NOT NULL,
  evenement_id text        NOT NULL,
  at           timestamptz NOT NULL,
  PRIMARY KEY (fournisseur, evenement_id)                          -- INSERT … ON CONFLICT DO NOTHING : vrai si nouveau
);

CREATE TABLE paiement_lien (
  id          uuid PRIMARY KEY,
  commande_id uuid        NOT NULL,
  empreinte   text        NOT NULL UNIQUE,                          -- SHA-256 du jeton ; le jeton n'est jamais stocké
  cree_par    uuid        NOT NULL,
  cree_a      timestamptz NOT NULL,
  expire_a    timestamptz NOT NULL,
  envoye_a    text,                                                 -- numéro masqué
  revoque_a   timestamptz
);
CREATE UNIQUE INDEX paiement_lien_un_actif ON paiement_lien (commande_id) WHERE revoque_a IS NULL;

CREATE TABLE compte_reversement (
  compagnie_id uuid PRIMARY KEY,
  compte_id    text NOT NULL                                        -- sous-compte chez l'agrégateur ; ligne supprimée pour retirer le compte
);

CREATE TABLE reglage_paiements (
  id      smallint PRIMARY KEY CHECK (id = 1),                      -- une seule ligne
  degrade boolean     NOT NULL,
  motif   text,
  par_id  uuid,
  at      timestamptz
);
```

- `Paiements.ouvrir` : `INSERT … ON CONFLICT DO NOTHING`, puis relire la ligne qui bloque (`cle` connue → `cle_connue`,
  sinon `en_cours`). `transitionner` : `UPDATE … WHERE id = $1 AND statut = ANY($2) RETURNING *`. `confirmer` :
  `UPDATE … SET confirmation = 'faite', billet_ids = $2 WHERE id = $1 AND confirmation = 'a_faire'`, faux si
  l'index `paiement_une_confirmee` refuse.
- `Remboursements.ajouter` : une transaction qui verrouille la ligne du paiement (`SELECT … FOR UPDATE`), cherche la clé,
  somme par bénéficiaire les lignes des remboursements non échoués, compare aux plafonds, insère.
- `LiensPaiement.remplacer` : une transaction (`UPDATE … SET revoque_a … WHERE commande_id AND revoque_a IS NULL`, puis `INSERT`).

## Décisions à confirmer

- **Frais de service rendus seulement si le départ est annulé.** Billet annulé par le voyageur ou l'agence : le
  prix remboursé (après la retenue éventuelle) revient de la compagnie, les frais restent acquis à AfriMove.
  Départ annulé : les frais du billet sont rendus aussi.
- **Compagnie sans compte de reversement : pas de paiement en ligne** (plutôt qu'encaisser pour elle).
- **Délais d'attente** : 3 minutes pour un paiement mobile, 10 minutes pour une carte (3-D Secure compris).
- **Paiement tardif accepté** (réussi après expiration) : billets émis si les places sont encore là, sinon remboursement.
- **Mode dégradé automatique** après 3 échecs d'affilée de l'agrégateur, circuit ouvert 30 s ; par processus (chaque
  instance de l'API apprend seule).
- **Encaissement à la gare** : l'agence garde l'argent, y compris la part de frais de service d'AfriMove, qui est
  consignée dans la répartition mais **sans mécanisme de reversement** (à régler avec la comptabilité).
- **Remboursement d'un paiement pris à la gare** : refusé par l'API (409 `REMBOURSEMENT_HORS_AGREGATEUR`), l'agence rend
  l'argent elle-même. Le billet annulé n'est donc pas remboursé ici.
- **SMS du lien d'un proche** : le gabarit `systeme` du module SMS refuse les adresses complètes, le lien part donc
  sans `https://` (`afrimove.app/payer/…`), avec un prénom réduit à des lettres. Le plus propre est d'ajouter au module
  SMS un gabarit dédié (texte fixe + lien) puis de brancher `NotifieurSms` dessus. Le SMS `systeme` n'est plus envoyé
  au-delà de 5 minutes : le proche reçoit un lien valable 15 minutes, mais le SMS lui-même doit partir tout de suite.
- **Carte étrangère** : le montant en devise est « approximatif » (taux de l'agrégateur) ; le débit final se fait au
  taux de l'émetteur de la carte. La commande est toujours encaissée en FCFA.
- **Retour de 3-D Secure** : l'application suit le statut par `GET /voyageur/paiements/:id` ; aucune page de retour
  n'est fournie ici.
- **Qui voit les références opérateur** : AfriMove (tout), patron et comptable (leur compagnie).
- **Remboursement manuel** réservé à AfriMove ; la raison (`motif`) est conservée dans l'audit.

## Ce qui n'a pas pu être vérifié

Aucun accès réseau ni compte sandbox : le format réel de l'agrégateur (JSON, codes d'erreur, signature des
webhooks), le comportement de MTN MoMo et d'Orange Money (délais de confirmation, push USSD, références), le
3-D Secure et les adaptateurs PostgreSQL n'ont pas été éprouvés ; tout est testé avec l'agrégateur simulé et les
ports en mémoire.

## Tests

`pnpm --filter @afrimove/api run test` — `regles.test.ts` (répartition, Luhn, numéros), `agregateurs.test.ts`
(simulateur, client HTTP, signature), `config.test.ts`, `paiements.service.test.ts` (initiation, moyens, guichet,
mode dégradé, disjoncteur, encaissement à la gare), `encaissements.service.test.ts` (webhook rejoué, doublons,
retard, montant inattendu, places perdues, balayage), `remboursements.service.test.ts` (plafonds, reprises,
annulation d'un billet), `liens.service.test.ts` (lien d'un proche), `contrats.test.ts` (parité avec les schémas
zod), `paiements.module.test.ts` (garde-fou de production), `paiements.e2e.test.ts` (HTTP avec la vraie billetterie :
rôles, webhook signé avec corps brut, billet émis une fois, annulation → remboursement, mode dégradé).
Le montage sans Nest (`testing/montage.ts`) fait avancer l'horloge : aucun test n'attend en vrai.
