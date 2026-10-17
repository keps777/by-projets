# Intégration de l'API : où en sont les modules

Ce fichier dit, module par module, ce qui tourne sur PostgreSQL et ce qui tourne encore en mémoire, où
sont les tables et leurs garde-fous, et dans quel ordre finir le travail. Il est mis à jour par
chaque étape d'intégration.

## En bref

- **Le schéma est complet.** `prisma/schema.prisma` couvre toutes les tables annoncées par les README de
  la synchronisation (AM-160), de la numérotation (AM-161), de la billetterie (AM-162), des colis
  (AM-163), de la caisse et de la supervision (AM-164) et des modules (AM-126). Deux migrations
  additives : `20261017000200_modules_metier` (tables et colonnes, générée par Prisma, avec reprise des
  données existantes) et `20261017000300_modules_metier_garanties` (garde-fous SQL).
- **Tous les modules sont dans `AppModule`**, la passerelle SMS (AM-166) comprise. Les routes de chaque
  module sont montées ; les tests e2e existants passent toujours.
- **Cinq modules ont leurs adaptateurs PostgreSQL** : la numérotation, les modules (AM-126), la
  synchronisation (AM-160), la billetterie (AM-162, sauf quatre ports sans table) et le journal des SMS
  (AM-166). Les autres restent en mémoire, derrière les mêmes ports.
- **Conséquence en production** : l'API **refuse de démarrer** avec `NODE_ENV=production` tant que la
  billetterie (promotions, proches, colis du départ, avis), les SMS (file Redis), les colis, la caisse et
  la supervision ont un port en mémoire (leur `VerificationStockage*` fait son travail). C'est voulu :
  aucune donnée métier ne doit se perdre au redémarrage. En développement et en test, rien ne change.
- **Migrations** : deux de plus, `20261017000400_sms_et_heure_texte` (tables `sms_message` et
  `sms_essai`, colonne `journal_evenement.atTexte` : l'heure telle que l'appareil l'a signée) et
  `20261017000500_sms_garanties` (CHECK, index unique partiel sur le fournisseur, essais en ajout seul).

## Choisir le stockage : `API_STOCKAGE`

| Valeur      | Effet                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| absente     | PostgreSQL si `NODE_ENV=production`, mémoire sinon (les tests restent en mémoire sans rien régler).                                                                 |
| `postgres`  | Les modules qui ont des adaptateurs PostgreSQL les utilisent (numérotation, modules, synchronisation, billetterie, journal des SMS), quel que soit l'environnement. |
| `memoire`   | Mémoire partout (en production, le garde-fou refuse alors de démarrer).                                                                                             |
| autre chose | L'application ne démarre pas (une faute de frappe ne bascule pas en silence).                                                                                       |

Le choix est fait par `socle/db/stockage.ts` (`stockageSurPostgres`) dans les fabriques des modules.

## État de chaque module

| Module (ticket)          | Dossier            | AppModule | Ports                                                                                                                                                                                                                | Stockage actuel                                                                                                 |
| ------------------------ | ------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Numérotation (AM-161)    | `src/numerotation` | oui       | `PlagesAttribuees`, `RegistreNumeros`, `AlertesNumerotation`                                                                                                                                                         | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE`                                                 |
| Modules (AM-126)         | `src/modules`      | oui       | `ReglagesModules`, `AnnuaireAgences` (`DetailsModules` reste le défaut sans détail)                                                                                                                                  | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE`                                                 |
| Synchronisation (AM-160) | `src/sync`         | oui       | `AppareilsSync`, `JournalSync`, `SiegesSync`, `AlertesSync`, `ProvisionnementSync`                                                                                                                                   | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE` (`ProvisionnementSync` : `ProvisionnementVide`) |
| Billetterie (AM-162)     | `src/billetterie`  | oui       | `Catalogue`, `Billets`, `Inventaire`, `Commandes`, `Scans`, `EvenementsTraites`, `PreferencesVoyageur`, `NumerotationEnLigne` ; restent en mémoire : `Promotions`, `ProchesVoyageur`, `ColisDuDepart`, `AvisBillets` | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE`                                                 |
| SMS (AM-166)             | `src/sms`          | oui       | `JournalSms` (PostgreSQL) ; `FileEnvoiSms` (BullMQ + Redis, à écrire)                                                                                                                                                | Journal **PostgreSQL** (`postgres.ts`) ou mémoire ; file en mémoire                                             |
| Colis (AM-163)           | `src/colis`        | oui       | `ColisRepository`, `PhotosColis`, `ReclamationsRepository`, `FichiersPhotos`, `ReferentielColis`, …                                                                                                                  | Mémoire                                                                                                         |
| Caisse (AM-164)          | `src/caisse`       | oui       | `SessionsCaisse`, `MouvementsCaisse`, `GuichetsAgence`, `ReglesAgence`, `AlertesPatron`, journal d'agence (`JournalAgenceRepository`, `EvenementsTraites`)                                                           | Mémoire                                                                                                         |
| Supervision (AM-164)     | `src/supervision`  | oui       | `RegistreBillets`, `DemandesAnnulation`, `SourceGare`, `EquipeGare`, `PinsEquipe`                                                                                                                                    | Mémoire                                                                                                         |

Le socle (comptes, authentification, audit, événements) était déjà sur PostgreSQL.

### Les tables de chaque module

| Module          | Tables (nom SQL)                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Synchronisation | `appareil_sync`, `journal_evenement` (avec `atTexte`), `siege_operation`, `siege_billet`, `siege_conflit`, `alerte_sync`                               |
| Numérotation    | `plage_attribuee`, `numero_vu`, `alerte_sync` (alertes de type `trou_dans_la_plage`)                                                                   |
| Billetterie     | `siege_depart`, `commande`, `scan_quai`, `evenement_traite`, `compagnie_preferee`, `filtres_voyageur`, et les colonnes ajoutées à `billet` et `depart` |
| Colis           | `photo_colis`, `reclamation_colis`, et les colonnes ajoutées à `colis`                                                                                 |
| Caisse          | `annulation_caisse`, `journal_agence`, `evenement_agence_traite`, et les colonnes ajoutées à `session_caisse`                                          |
| Supervision     | `demande_annulation`                                                                                                                                   |
| Modules         | `module_compagnie` (existait), `module_exception`                                                                                                      |
| SMS             | `sms_message`, `sms_essai`                                                                                                                             |

Les tables existantes réutilisées, sans rien casser : `compagnie`, `gare`, `guichet`, `ligne`, `bus`,
`personne` (colonnes `pinProvisoireJusqua`, `guichetId`), `depart` (quai, chauffeur, convoyeur,
`versionPlan`), `billet`, `colis`, `session_caisse`, `module_compagnie`. Toutes les colonnes ajoutées
sont nullables ou ont une valeur par défaut ; les deux colonnes obligatoires ajoutées à des tables qui
ont déjà des lignes (`session_caisse` : gare, compagnie, rang ; `colis.jour`) sont remplies par la
migration avant de devenir `NOT NULL` (testé par `socle/db/migration-modules-metier.integration.test.ts`).

### Garanties tenues par la base

Elles valent même si une requête est écrite à la main ou si deux requêtes se croisent.

- **Un siège ne se vend pas deux fois** : clé primaire `(departId, siege)` de `siege_depart`, plus un
  index unique partiel `billet_siege_vivant_unique` côté `billet` (jamais deux billets vivants sur le
  même siège d'un départ) et `billet_code_unique_par_depart` (le code à 4 chiffres).
- **Un numéro n'est jamais attribué deux fois** : clé primaire `(portee, jour, genre, numero)` de
  `numero_vu` (portée = la gare, jour = AAMMJJ de Douala, genre = billet ou colis) ; un numéro du serveur
  est idempotent par référence (`numero_vu_reference_serveur`).
- **Les plages ne se recouvrent jamais** : contrainte d'exclusion (`btree_gist`, `int4range`) sur
  `plage_attribuee` par portée pour les plages en cours, et une seule attribution en cours par appareil.
- **Ajout seul** (aucun `UPDATE`, `DELETE` ni `TRUNCATE`, comme `evenement` et `journal_audit`) :
  `journal_evenement`, `siege_operation`, `numero_vu`, `scan_quai`, `evenement_traite`,
  `annulation_caisse`, `journal_agence`. La chaîne d'empreintes de `journal_agence` ne se ramifie pas
  (index unique sur l'entrée précédente, `NULL` non distinct).
- **Une caisse ouverte par agent et par guichet** (index uniques partiels sur `session_caisse`) : c'est
  ce qui rend l'ouverture atomique. **Une demande d'annulation en attente par billet.**
- **Idempotence par UUID d'événement** : `journal_evenement.id` est unique ; l'écriture est un
  `INSERT … ON CONFLICT (id) DO NOTHING RETURNING seq`, donc de deux requêtes qui portent le même
  événement, une seule écrit et reçoit le rang. Même mécanisme pour `siege_operation`
  (`(departId, siege, evenementId)`), `siege_conflit` (`evenementId`), `evenement_traite` et `scan_quai`.
- **Un scan ne passe qu'une fois** : `scan_quai.evenementId` unique pour le rejeu, et le changement d'état d'un
  billet (`transitionner`) est un `UPDATE … WHERE etat = ANY(…)` : de deux scans simultanés, un seul touche
  la ligne, l'autre est refusé. Un siège ne se vend qu'une fois : `INSERT … ON CONFLICT (departId, siege)
DO UPDATE … WHERE` (libre, ou bloqué par la même commande) sur `siege_depart`, jamais « lire puis écrire ».
- **Un SMS par clé** : `sms_message.cle` unique (`INSERT … ON CONFLICT DO NOTHING`) ; un changement de
  statut est un `UPDATE … WHERE id = $1 AND statut IN (…)` (un accusé et un réessai qui se croisent ne
  font jamais reculer le statut) ; un identifiant de fournisseur n'appartient qu'à un message ; les essais
  (`sms_essai`) sont en ajout seul ; le texte d'un SMS n'a aucune colonne.
- **Modules** : les 12 codes du catalogue en `CHECK`, une exception par module et par gare ou par ville,
  portée cohérente (une gare nomme une gare, une ville nomme une ville).

## Tests

```
createdb afrimove_test       # base JETABLE : le nom finit par _test, le schéma public est vidé
DATABASE_URL_TEST=postgresql://user@localhost:5432/afrimove_test pnpm --filter @afrimove/api run test
```

Sans `DATABASE_URL_TEST`, les tests d'intégration sont ignorés (la CI actuelle n'a pas de base). Avec,
ils tournent l'un après l'autre (verrou consultatif dans `socle/testing/base-integration.ts`). Fichiers :

- `socle/db/db.integration.test.ts` : migrations, déclencheurs, contraintes du socle et des modules ;
- `socle/db/migration-modules-metier.integration.test.ts` : reprise de données déjà présentes ;
- `numerotation/postgres.integration.test.ts` : le contrat des trois ports sur la mémoire (toujours) et
  sur PostgreSQL, les garanties de la base, les services complets, l'API avec `API_STOCKAGE=postgres` et
  un redémarrage ;
- `modules/postgres.integration.test.ts` : de même pour les modules (AM-126) ;
- `sync/postgres.integration.test.ts` : le contrat des cinq ports de la synchronisation, ajout seul,
  idempotence par UUID d'événement, six lots identiques simultanés, deux guichets sur le même siège,
  l'API avec `API_STOCKAGE=postgres` et un redémarrage ;
- `billetterie/postgres.integration.test.ts` : le contrat des ports de la billetterie, siège jamais vendu
  deux fois (requêtes simultanées), double scan refusé, numéros en ligne sans trou, l'API de bout en bout ;
- `sms/postgres.integration.test.ts` : le contrat du journal, clé d'idempotence, statuts conditionnels,
  essais en ajout seul, aucun texte stocké, l'API (billet, accusé signé en corps brut, reprise,
  redémarrage).

Chaque nouvel adaptateur suit ce patron : **une suite de contrat écrite une fois, passée par la mémoire
et par PostgreSQL**. C'est ce qui garantit que la mémoire, sur laquelle tournent tous les autres tests,
se comporte comme la base. Les suites sont dans `numerotation/testing/contrat-ports.ts`, `sync/testing/contrat-ports.ts`,
`billetterie/testing/contrat-ports.ts` et `sms/testing/contrat-journal.ts`.

## Ce qui reste à faire, dans l'ordre

1. **Fait : synchronisation** (`src/sync/postgres.ts`) et **billetterie** (`src/billetterie/postgres.ts`).
   Restent pour la billetterie : `Promotions`, `ProchesVoyageur`, `ColisDuDepart` (à brancher sur les colis)
   et `AvisBillets`, qui n'ont pas de table et empêchent encore le démarrage en production ; poser
   `BILLETTERIE_QR_CLE_PRIVEE` (secret). `ProvisionnementSync` est branché sur `ProvisionnementVide`
   (aucune part de sièges hors ligne, aucun vérificateur de PIN) : il faudra le rebrancher sur la
   billetterie et les comptes quand l'appareil devra valider un déblocage sur place.
2. **Fait : journal des SMS** (`src/sms/postgres.ts`). Reste la **file d'envoi** (`FileEnvoiSms` sur
   BullMQ + Redis, voir `src/sms/README.md`) : sans elle `SmsModule` refuse de démarrer en production.
3. **Colis** (`src/colis`) : `ColisRepository` (version optimiste sur la colonne `version`), `PhotosColis`,
   `ReclamationsRepository`, `NumerotationColis` (à brancher sur `NumerotationService.prendreEnLigne`,
   déjà disponible sur PostgreSQL).
4. **Caisse puis supervision** (`src/caisse`, `src/supervision`) : `SessionsCaisse` (les index uniques
   rendent l'ouverture atomique), `MouvementsCaisse`, journal d'agence (chaîne d'empreintes : prendre le
   verrou consultatif, lire la dernière entrée, insérer ; l'index unique est le filet), puis
   `RegistreBillets`, `DemandesAnnulation`, `SourceGare`, `EquipeGare`, `PinsEquipe`. La caisse doit
   recevoir les ventes de la billetterie et des colis (`MouvementsCaisse.decompte`).
5. **Autres reliquats connus** (hors adaptateurs) :
   - donner un PIN de signature aux comptes patron (ils se connectent par mot de passe ; `personne.pinHache`
     est posé à la main dans les tests) ;
   - la connexion doit refuser un PIN provisoire expiré (`personne.pinProvisoireJusqua`) et imposer le
     changement à la première connexion (code du socle d'authentification) ;
   - `module_exception.creePar` n'est jamais renseigné : le port `ReglagesModules` ne porte pas l'auteur,
     la trace est le journal d'audit (`module.changer`) ;
   - protéger les routes des autres modules avec `@ModuleRequis` au fur et à mesure ;
   - exporter `ModulesActifsSchema` dans `packages/contrats` ;
   - lancer `ControleJourneeService.controler` chaque soir (aucun planificateur n'est fourni).
6. **Quand tout est branché** : retirer `API_STOCKAGE=memoire` de tout script, vérifier qu'`API_STOCKAGE`
   absent + `NODE_ENV=production` démarre, et ajouter un test e2e de bout en bout sur PostgreSQL (un billet
   vendu hors ligne, synchronisé, compté en caisse).

## Décisions et écarts à connaître

- **`appareil_sync` et non `appareil`** : la table `appareil` du socle (AM-017) décrit les appareils
  enregistrés par l'administration (clé UUID, type) ; la synchronisation reçoit des identifiants de texte
  posés par les téléphones. Les deux coexistent ; les rapprocher est du ressort de l'administration des
  appareils (AM-093, AM-120).
- **Pas de clé étrangère sur ce qui vient des appareils** (`journal_evenement`, `siege_operation`,
  `scan_quai`, `numero_vu`…) : une vente déjà imprimée ne se refuse jamais pour un motif de référence.
  Les identifiants y sont du texte ; le serveur vérifie, signale (alerte) et garde.
- **`evenement_agence_traite`** : le port du journal d'agence s'appelle `EvenementsTraites`, comme celui de
  la billetterie ; la table de la caisse porte le préfixe pour ne pas se heurter à `evenement_traite`.
- **`compteur_colis_en_ligne` n'existe pas** : le README du module colis l'annonce, mais le compteur du
  jour des colis en ligne est le registre `numero_vu` lui-même (genre `colis`), qui donne le plus petit
  numéro libre de la plage 4001 et suivants. Une seule source de vérité, pas deux compteurs à garder
  d'accord.
- **Colonnes en double dans `session_caisse`** : les anciennes colonnes (`cashCompte`, `ecart`, `etat`,
  `historique`…) restent, les nouvelles (`comptage`, `cloture`, `validation`, `refus`…) portent le détail
  du module caisse. Aucune n'est supprimée (migrations additives) ; l'adaptateur choisira laquelle fait
  foi et pourra remplir les deux.
- **Les jours** : toutes les dates de jour sont des `AAMMJJ` en heure de Douala (UTC+1,
  sans heure d'été), calculés par `versIsoDouala` ; la reprise de `colis.jour` fait le même calcul en SQL.
- **`SmsGateway` dans l'application** : `AuthModule` fournit `SmsGatewayPasserelle` (file, reprise,
  secours, journal) sauf avec `NODE_ENV=test`, où le simulateur `SmsMock` du socle reste en place parce que
  les helpers de test du socle, de la caisse et des colis lisent sa boîte (`messages()`, `dernier()`). La
  passerelle est testée dans `src/sms`. Un code de connexion mis en file ne fait donc plus échouer la
  connexion si aucun SMS ne peut partir (voir `src/sms/README.md`).
- **`main.ts`** crée l'application avec `rawBody: true` : le webhook des accusés SMS signe le corps exact.
- **Heure d'origine du journal de synchronisation** : `journal_evenement.atTexte` garde l'heure telle que
  l'appareil l'a écrite (la signature porte sur ce texte) ; `at` en est la valeur horodatée.
- **Verrous consultatifs** : `pg_advisory_xact_lock(int, int)` avec un espace par usage (numérotation :
  `7_017_161`, billetterie : `7_017_162`, tests d'intégration : `7_017_999`). Un nouvel adaptateur qui prend un verrou choisit un
  nouvel espace, pour ne pas bloquer un autre module.
