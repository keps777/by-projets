# Caisse (AM-164)

Backend de la caisse du guichet : ouverture, comptage, clôture, clôture automatique de minuit, et le
**journal signé** de l'agence (lu par le superviseur et le patron). Le module `SupervisionModule`
(`../supervision`) s'appuie sur celui-ci.

Module Nest autonome : `CaisseModule` (importe `JournalAgenceModule`). Il n'est **pas** branché dans
`AppModule` (hors périmètre) : voir « À brancher par le coordinateur ».

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

## Ports (classes abstraites) et adaptateurs en mémoire

Tous exposent `durable`. **Sans adaptateur PostgreSQL, le module refuse de démarrer en production**
(`exigerStockageDurable`, même principe que `SyncModule`).

| Port                      | Rôle                                                                                 | Version mémoire            |
| ------------------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| `SessionsCaisse`          | sessions : `creer` atomique, `transiter` compare-et-échange, lectures                | `SessionsMemoire`          |
| `MouvementsCaisse`        | décompte (billets cash, colis cash, MoMo, annulations) + annulation                  | `MouvementsMemoire`        |
| `GuichetsAgence`          | guichet → rang, gare, code de gare, compagnie                                        | `GuichetsMemoire`          |
| `ReglesAgence`            | tolérance d'écart par compagnie                                                      | `ReglesMemoire`            |
| `AlertesPatron`           | alertes au patron (clôture auto, PIN bloqué, compte désactivé, écart hors tolérance) | `AlertesPatronMemoire`     |
| `JournalAgenceRepository` | journal en ajout seul, chaîne par compagnie                                          | `JournalAgenceMemoire`     |
| `EvenementsTraites`       | idempotence : `commencer` / `terminer` / `abandonner`                                | `EvenementsTraitesMemoire` |

## Tables PostgreSQL attendues (à créer par le coordinateur)

`prisma/schema.prisma` n'est pas touché par ce ticket. Une table existante peut être reprise si
elle a les mêmes colonnes ; les noms ci-dessous sont indicatifs.

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

1. `AppModule` : importer `CaisseModule` (et `SupervisionModule`).
2. Fournir les adaptateurs PostgreSQL des ports ci-dessus (`{ provide: SessionsCaisse, useClass: … }`),
   `durable = true`.
3. Les ventes et colis cash doivent alimenter `MouvementsCaisse.decompte`.

## Tests

`caisse.e2e.test.ts` (API complète en mémoire), `parite.test.ts`, `unitaires.test.ts`. Le harnais
`testing/app-agence-test.ts` monte `AppModule` + `CaisseModule` avec les comptes du socle en mémoire.
