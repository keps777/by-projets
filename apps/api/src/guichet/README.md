# Guichet : accueil, cadence, impressions (lot Db, recette AM-181, anomalie A2)

Module Nest `GuichetModule` : les six routes que l'application du guichet appelle en vendant et que la recette
(AM-181) trouvait absentes. Il ne possède qu'une table, `impression_agence` ; tout le reste est **lu** dans les
modules existants (billetterie, caisse, colis, départs).

Même patron que les autres modules : des **ports** (classes abstraites, `ports.ts`) avec une version **en
mémoire** (`memoire.ts`) et une version **PostgreSQL** (`postgres.ts`, Prisma), choisies par `API_STOCKAGE`
(`stockageSurPostgres(config)`). En production, `VerificationStockageGuichet` refuse de démarrer tant que le
port des impressions n'est pas durable.

## Routes

Les formes viennent de `@afrimove/contrats` (`agence`) et de `@afrimove/api-client`. L'API ne peut pas importer
zod : les lecteurs sont écrits à la main (`evenements.ts`) et `parite.test.ts` les compare aux schémas.

| Route                                | Rôles                                       | Contrat                         |
| ------------------------------------ | ------------------------------------------- | ------------------------------- |
| `GET /agence/guichet/accueil`        | guichetier                                  | `SchemaGuichetAccueil`          |
| `GET /agence/cadence?departId=`      | guichetier                                  | `SchemaCadenceEtat`             |
| `GET /agence/cadence/billets/:id`    | guichetier                                  | `SchemaCadenceBillet`           |
| `GET /agence/impression`             | guichetier, superviseur, convoyeur, vendeur | `SchemaImpressionEtat`          |
| `POST /agence/impressions`           | guichetier, superviseur, convoyeur, vendeur | événement `impression.demandee` |
| `GET /agence/quai/cadence?departId=` | guichetier, superviseur                     | `SchemaQuaiCadence`             |

`POST /agence/impressions` est idempotent par l'identifiant de l'événement (`IdempotenceService` de la caisse :
`accepte` puis `deja_recu`).

## Table PostgreSQL

Migration `20261018001001_lot_db_impressions` (préfixe réservé du lot Db : `20261018001000`–`099`).

**`impression_agence`** (ajout seul : deux déclencheurs refusent `UPDATE`, `DELETE` et `TRUNCATE`)

| Colonne        | Type               | Remarque                                                         |
| -------------- | ------------------ | ---------------------------------------------------------------- |
| `evenementId`  | uuid, clé primaire | identifiant de l'événement : un rejeu n'ajoute rien              |
| `document`     | text               | `billet`, `etiquette_colis`, `ticket_caisse` (CHECK)             |
| `documentId`   | text               | identifiant du document imprimé                                  |
| `copies`       | int                | 1 à 5 (CHECK)                                                    |
| `reimpression` | bool               |                                                                  |
| `auteurId`     | uuid               | clé étrangère vers `personne`                                    |
| `appareilId`   | text               |                                                                  |
| `compagnieId`  | uuid, null         | clé étrangère vers `compagnie` ; null si le document est inconnu |
| `imprimeeA`    | timestamptz        | heure de l'impression sur l'appareil                             |
| `recuA`        | timestamptz        | heure de réception par le serveur                                |

Index : `(document, documentId)` et `(auteurId, imprimeeA)`. Aucun verrou consultatif n'est pris.

Les impressions ne sont pas écrites dans le journal signé de l'agence : ce sont des traces d'usage, pas des
faits comptables.

## Règles appliquées (provisoires, à confirmer)

Le contrat n'en dit pas plus que les formes. Ce qui suit est le choix du lot, à valider avec le métier.

**Accueil** (`AccueilService`)

- _Billets_ : billets non annulés du guichet de l'agent depuis l'ouverture de sa session de caisse ; sans caisse
  ouverte, depuis le début du jour de Douala. _Colis_ : colis déposés par l'agent depuis le même moment
  (`depose.par`) ; _colis à charger_ = ceux encore à l'état « enregistré ».
- _En caisse_ = `cashAttendu` de la vue de caisse de la session ; _écart_ = compté − attendu, 0 si rien n'a été
  compté. Sans session : 0 et 0, `caisseOuverteA` vaut `null`.
- _Quai_ : le départ en embarquement de la gare, sinon le prochain départ avec un bus ; scannés = billets
  embarqués ou en voyage ; capacité = celle du bus. `null` s'il n'y en a pas.
- _File d'attente_ : billets de cadence du jour du guichet encore « payés » et à compléter au quai.
- _Prochain départ_ : premier départ en vente, en embarquement ou retardé qui n'est pas parti depuis plus de
  30 minutes ; `null` quand il n'y en a plus. _Prochaine ouverture_ : premier départ « programmé » de la gare.
- _SYNC_ : toujours `sync` et 0 en attente au moment de la réponse (l'état de la file est sur l'appareil).

**Cadence** (`CadenceService`) : un billet « de cadence » est un billet créé par un événement
`billet.vendu_cadence` (lu par `EvenementsTraites.typesDe`).

- Départ : celui demandé, sinon le premier ouvert à la vente (en vente ou embarquement, bus affecté, places
  libres, dans les 24 heures) ; aucun : 409 `AUCUN_DEPART`.
- _Vendus en cadence_ et _annulations_ : billets de cadence du jour du guichet. _Dernier billet_ : le dernier
  non annulé.
- Un billet de cadence se lit avec durée 0, reçu = prix (espèces, rendu 0) et `plageSansTrou` vrai si tous les
  numéros de la plage du guichet jusqu'au sien existent ce jour-là. Un billet qui n'est pas de cadence : 404
  `BILLET_INCONNU`.
- _Quai_ : dernier scan « sans nom » dont le billet attend encore sa fiche ; 404 `AUCUN_BILLET_CADENCE` sinon ;
  409 `EQUIPAGE_INCOMPLET` sans bus, convoyeur ou quai. La saisie est toujours vide (nom et pièce vides,
  téléphone du billet).

**Impressions** (`ImpressionsService`)

- Le serveur répond toujours `imprime` : l'état réel de l'imprimante est sur l'appareil. `GET /agence/impression`
  renvoie `{ imprimante: { etat: "ok", nom: null } }`.
- Un document d'une autre compagnie : 404 `DOCUMENT_INCONNU`. Un document que le serveur ne connaît pas encore
  (appareil hors ligne) est accepté et enregistré.
- L'auteur de l'événement doit être le compte connecté : sinon 403 `AUTEUR_INCOHERENT`.
- Les copies se cumulent par document (`copiesDe`).

## Changement de contrat

`SchemaGuichetAccueil` : `guichet.caisseOuverteA`, `quai` et `prochainDepart` acceptent `null`. Une caisse
fermée ou une journée sans départ sont des états normaux ; les remplir de fausses valeurs aurait trompé
l'écran. Rétrocompatible : l'application sait déjà afficher ces trois cas (textes `fr`, `en`, `pcm`).

## Tests

- `guichet.e2e.test.ts` (mémoire, API complète), `parite.test.ts` (lecteurs écrits à la main et schémas zod),
  `memoire.test.ts` et `testing/contrat-ports.ts` (contrat des ports, passé par la mémoire et par PostgreSQL).
- `postgres.integration.test.ts` (ignoré sans `DATABASE_URL_TEST`) : contrat sur PostgreSQL, garanties de la
  base (ajout seul, CHECK) et API complète avec `API_STOCKAGE=postgres`.

## Reste à faire

- État réel de l'imprimante : aujourd'hui côté appareil seulement.
- File d'attente de synchronisation : le serveur ne connaît pas celle de l'appareil.
- Valider les règles ci-dessus avec le métier (accueil, cadence, copies).
