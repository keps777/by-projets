# Caisse (AM-164)

Backend de la caisse du guichet : ouverture, comptage, clôture, clôture automatique de minuit, et le
**journal signé** de l'agence (lu par le superviseur et le patron). Le module `SupervisionModule`
(`../supervision`) s'appuie sur celui-ci.

Module Nest autonome : `CaisseModule` (importe `JournalAgenceModule`). Il est branché dans
`AppModule` ; ses ports ont une version mémoire et une version PostgreSQL (`postgres.ts`,
`journal/postgres.ts`), choisies par `API_STOCKAGE` (`apps/api/INTEGRATION.md`).

## Routes et contrat

Chemins et noms d'opérations de `packages/api-client/src/agence/operations.ts` ; schémas de
`@afrimove/contrats` (`agence`).

| Opération                | Route                           | Rôles                   | Corps / réponse                                                        |
| ------------------------ | ------------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `agence.caisse.session`  | `GET  /agence/caisse/session`   | guichetier, superviseur | `SchemaCaisseSession` (`?sessionId=` facultatif)                       |
| `agence.caisse.ouverte`  | `POST /agence/caisse/ouverture` | guichetier              | événement `caisse.ouverte` → `SchemaResultatCaisse`                    |
| `agence.caisse.comptee`  | `POST /agence/caisse/comptage`  | guichetier              | événement `caisse.comptee` → `SchemaResultatCaisse`                    |
| `agence.caisse.cloturee` | `POST /agence/caisse/cloture`   | guichetier              | événement `caisse.cloturee` → `SchemaResultatCaisse`                   |
| `agence.journal.lister`  | `GET  /agence/journal`          | superviseur, patron     | `SchemaJournal` (`personneId`, `sessionId`, `jour`, `apres`, `limite`) |

Toute écriture est un **événement** `{ id (UUID de l'appareil), type, at (ISO +01:00), appareilId,
auteurId, cible, numeroPlage: null, donnees }`.

- **Idempotence** : le serveur dédoublonne sur `id`. Rejouer répond 200 avec le résultat de la première
  fois et `accuse.statut = "deja_recu"` (rien n'est écrit en plus). Deux requêtes simultanées du même
  événement : une seule est traitée, l'autre reçoit 425 `EVENEMENT_EN_COURS` (le client relance).
- **Erreurs** : corps `{ code, message, details? }` (lu par `ErreurHttp` du client). 422
  `EVENEMENT_INVALIDE` avec `details: [{ chemin, message }]` pour un événement mal formé.
- **Le serveur recalcule** : le cash attendu est calculé par le serveur (fond + billets cash + colis
  cash − annulations validées ; le MoMo n'entre pas). La valeur de l'appareil n'est qu'un témoin
  (`divergenceAppareil`, mentionnée dans le commentaire proposé au superviseur). L'écart est
  `compté − attendu` au franc près, `dans_tolerance` si `|écart| ≤ tolérance` (1 000 F par défaut,
  réglable par compagnie via le port `ReglesAgence`).
- **Une caisse ouverte par agent et par guichet**, numéro `K-GARE-AAMMJJ-RANG-N` vérifié.
- **Clôture automatique** à minuit (Douala) : `CaisseService.cloturerLesSessionsDeMinuit()`, appelé
  chaque minute par `PlanificateurClotureAuto` (désactivé quand `NODE_ENV=test`). Elle est idempotente
  (UUID d'événement déterministe), compte depuis le dernier comptage (0 s'il n'y en a pas :
  `comptageAbsent`), est écrite au journal avec l'auteur « Système » et alerte le patron. Un appareil
  ne peut pas envoyer `auto: true` (422 `CLOTURE_AUTO_RESERVEE`).

## Journal signé

Chaque écriture ajoute une entrée à une chaîne par compagnie : `empreinte = HMAC-SHA256(clé,
précédente + "\n" + JSON canonique de l'entrée)`. La clé est dérivée de `config.cleAudit`
(libellé `journal.agence.v1`). `GET /agence/journal` vérifie toute la chaîne (`chaineValide`) et
pagine du plus récent au plus ancien (curseur `apres` = numéro d'ordre). Le superviseur ne lit que sa
gare, le patron sa compagnie. Aucun PIN, code, mot de passe ou haché n'y entre (testé).

## Ports (classes abstraites) et adaptateurs

Tous exposent `durable`. **Avec un port en mémoire, le module refuse de démarrer en production**
(`exigerStockageDurable`, même principe que `SyncModule`) ; avec `API_STOCKAGE=postgres` (ou
`NODE_ENV=production` sans réglage) les adaptateurs PostgreSQL sont choisis.

| Port                      | Rôle                                                                                 | Mémoire                    | PostgreSQL                |
| ------------------------- | ------------------------------------------------------------------------------------ | -------------------------- | ------------------------- |
| `SessionsCaisse`          | sessions : `creer` atomique, `transiter` compare-et-échange, lectures                | `SessionsMemoire`          | `SessionsCaissePrisma`    |
| `MouvementsCaisse`        | décompte (billets cash, colis cash, MoMo, annulations) + annulation                  | `MouvementsMemoire`        | `MouvementsCaissePrisma`  |
| `GuichetsAgence`          | guichet → rang, gare, code de gare, compagnie                                        | `GuichetsMemoire`          | `GuichetsAgencePrisma`    |
| `ReglesAgence`            | tolérance d'écart par compagnie                                                      | `ReglesMemoire`            | `ReglesAgencePrisma`      |
| `AlertesPatron`           | alertes au patron (clôture auto, PIN bloqué, compte désactivé, écart hors tolérance) | `AlertesPatronMemoire`     | `AlertesPatronPrisma`     |
| `JournalAgenceRepository` | journal en ajout seul, chaîne par compagnie                                          | `JournalAgenceMemoire`     | `JournalAgencePrisma`     |
| `EvenementsTraites`       | idempotence : `commencer` / `terminer` / `abandonner`                                | `EvenementsTraitesMemoire` | `EvenementsTraitesPrisma` |

## Tables PostgreSQL

Les tables sont créées (schéma Prisma et migrations `…000200`, `…000300`, `…000400`). Ce qui est
décidé, et ce que la base garantit :

- **`session_caisse`** : une caisse ouverte par agent et par guichet (index uniques partiels, ce qui
  rend `creer` atomique) ; `transiter` est un `UPDATE … WHERE id AND etat`. Les colonnes en double sont
  tranchées : le JSON `cloture` et le JSON `validation` **font foi**, les colonnes `clotureeA`,
  `cashCompte`, `cashAttendu`, `ecart`, `clotureeAuto`, `valideeA`, `valideeParId` en sont une copie
  interrogeable écrite dans la même instruction (les `CHECK` `session_cloture_copie` et
  `session_validation_copie` refusent toute divergence), et `historique` est abandonnée (`[]`).
- **`annulation_caisse`** : une ligne par demande (idempotence), ajout seul. Le décompte du serveur
  (`MouvementsCaissePrisma.decompte`) est calculé depuis `billet` (cash seulement ; un billet sans
  paiement connu compte comme mobile money), `colis` et `annulation_caisse`.
- **`journal_agence`** : ajout seul, chaîne par compagnie ; `ajouter` prend le verrou consultatif
  `7_017_164`, lit la tête et insère (l'index unique `(chaine, precedente)` est le filet). L'identifiant
  d'événement est mis en minuscules et l'instant écrit à l'heure de Douala avant la signature, pour
  qu'une relecture recalcule la même empreinte.
- **`evenement_agence_traite`** : idempotence (`INSERT … ON CONFLICT DO NOTHING`) ; une réservation
  « en cours » abandonnée depuis plus de cinq minutes est reprise.
- **`alerte_patron`** (nouvelle) et **`compagnie.toleranceEcartCaisse`** (nouvelle, 1 000 F si absente).
- Des identifiants qui ne sont pas des UUID sont refusés (`identifiant_invalide`, HTTP 422
  `IDENTIFIANT_INVALIDE`) ; les tests en mémoire gardent des identifiants de texte.

Description d'origine des colonnes, gardée comme référence de leur sens (noms indicatifs) :

- **`session_caisse`** : `id` PK, `numero` UNIQUE, `guichet_id`, `guichet_rang`, `gare_id`,
  `compagnie_id`, `agent_id`, `fond_de_caisse` int, `tolerance` int, `ouverte_a` timestamptz,
  `reouverte_a` timestamptz NULL, `etat` (`ouverte|cloturee|validee`), `comptage` jsonb NULL
  (`{coupures, pieces, total}`), `cloture` jsonb NULL (`at, auto, cashCompte, cashAttendu, ecart,
divergenceAppareil, comptageAbsent, decompte, evenementId`), `validation` jsonb NULL, `refus` jsonb
  (liste), `evenement_ouverture_id`. **Index uniques partiels** : un seul `etat='ouverte'` par
  `agent_id` et par `guichet_id` (c'est ce qui rend `creer` atomique). `transiter` = `UPDATE … WHERE
id=? AND etat=?`.
- **`annulation_caisse`** : `demande_id` PK (idempotence), `session_id`, `montant` int, `at`. Le
  décompte additionne les montants d'une session. Les ventes cash et colis cash viennent des
  événements `billet.vendu` / `colis.enregistre` des autres modules (à agréger dans
  `MouvementsCaisse.decompte`, filtre agent + guichet + intervalle `[ouverte_a, jusqua]`).
- **`journal_agence`** : `seq` bigserial PK, `chaine` (compagnie), `evenement_id` UNIQUE, `gare_id`,
  `compagnie_id`, `type`, `at`, `auteur_id`, `auteur_nom`, `appareil_id`, `cible_type`, `cible_id`,
  `numero_plage`, `resume`, `valide_par` jsonb NULL, `empreinte`, `precedente`. `ajouter` lit la tête
  de la chaîne et écrit dans la même transaction (verrou consultatif sur la chaîne). Aucune
  mise à jour ni suppression (révoquer `UPDATE`/`DELETE` au rôle applicatif).
- **`evenement_traite`** : `evenement_id` UUID PK, `etat` (`en_cours|termine`), `resultat` jsonb NULL,
  `recu_a` timestamptz NULL. `commencer` = `INSERT … ON CONFLICT DO NOTHING` puis lecture.
- Guichets, règles (tolérance) et alertes : tables du socle / de l'écran Règles du patron.

## Décisions et limites à confirmer

- Les règles de `@afrimove/domain` (non compilé, non importable à l'exécution) sont recopiées dans
  `regles.ts` et `temps.ts` ; les événements sont relus à la main (`validation.ts`, `evenements.ts`).
  `parite.test.ts` compare tout à la source (valeurs, grilles de cas, variantes abîmées champ par champ).
- L'écart de la maquette (« ± 500 » sur une planche, 1 000 F ailleurs) : 1 000 F par défaut, comme
  `REGLES_PAR_DEFAUT`.
- Un agent qui n'a jamais compté : l'écart affiché est calculé avec un comptage de 0 (hors tolérance).
  À confirmer côté produit.
- Les appareils (WebSocket, `PlanificateurClotureAuto` sur plusieurs instances) : en multi-instances,
  le planificateur peut tourner en double ; c'est sans danger (clôture idempotente) mais à confier à un
  seul worker à terme.

## À brancher par le coordinateur

1. Fait : `CaisseModule` et `SupervisionModule` sont dans `AppModule`.
2. Fait : les adaptateurs PostgreSQL des ports ci-dessus (`durable = true`), choisis par fabrique.
3. Fait côté lecture : `MouvementsCaisse.decompte` lit les ventes cash et les colis cash dans `billet`
   et `colis`. Les ventes de la billetterie y apparaîtront dès qu'elle écrit dans PostgreSQL.

## Tests

`caisse.e2e.test.ts` (API complète en mémoire), `parite.test.ts`, `unitaires.test.ts`. Le harnais
`testing/app-agence-test.ts` monte `AppModule` + `CaisseModule` avec les comptes du socle en mémoire.

Sur PostgreSQL (ignorés sans `DATABASE_URL_TEST`) : `postgres.integration.test.ts` passe la suite de
contrat `testing/contrat-ports.ts` sur la mémoire et sur PostgreSQL, vérifie ce que seule la base garantit
(caisse unique, chaîne falsifiée détectée, journal en ajout seul) et l'API de bout en bout ;
`migration-caisse.integration.test.ts` rejoue la reprise de sessions écrites dans l'ancien format. Le
harnais `testing/app-agence-pg.ts` monte l'application sur PostgreSQL.
