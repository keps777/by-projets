# Intégration de l'API : où en sont les modules

Ce fichier dit, module par module, ce qui tourne sur PostgreSQL et ce qui tourne encore en mémoire, où
sont les tables et leurs garde-fous, et dans quel ordre finir le travail. Il est mis à jour par
chaque étape d'intégration.

## En bref

- **Le schéma est complet.** `prisma/schema.prisma` couvre toutes les tables annoncées par les README de
  la synchronisation (AM-160), de la numérotation (AM-161), de la billetterie (AM-162), des colis
  (AM-163), de la caisse et de la supervision (AM-164) et des modules (AM-126). Deux migrations
  additives : `20261017000200_modules_metier` (tables et colonnes, générée par Prisma, avec reprise des
  données existantes) et `20261017000300_modules_metier_garanties` (garde-fous SQL), puis, à l'étape 2b,
  `20261017000400_colis_caisse_supervision_garanties` (alertes du patron, tolérance d'écart, choix des
  colonnes en double de `session_caisse`, garde-fous des colis).
- **Tous les modules sont dans `AppModule`.** Les routes de chaque module sont montées ; les tests e2e
  existants passent toujours.
- **Cinq modules ont leurs adaptateurs PostgreSQL** : la numérotation, les modules (AM-126), les colis
  (AM-163), la caisse et la supervision (AM-164). La synchronisation et la billetterie restent en
  mémoire, derrière les mêmes ports.
- **Conséquence en production** : l'API **refuse de démarrer** avec `NODE_ENV=production` tant que la
  synchronisation et la billetterie ont un port en mémoire (leur `VerificationStockage*` fait son
  travail). C'est voulu : aucune donnée métier ne doit se perdre au redémarrage. En développement et en
  test, rien ne change. Les garde-fous des colis, de la caisse et de la supervision restent en place :
  ils ne se déclenchent plus que si `API_STOCKAGE=memoire` est forcé.

## Choisir le stockage : `API_STOCKAGE`

| Valeur      | Effet                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| absente     | PostgreSQL si `NODE_ENV=production`, mémoire sinon (les tests restent en mémoire sans rien régler).                                              |
| `postgres`  | Les modules qui ont des adaptateurs PostgreSQL les utilisent (numérotation, modules, colis, caisse, supervision), quel que soit l'environnement. |
| `memoire`   | Mémoire partout (en production, le garde-fou refuse alors de démarrer).                                                                          |
| autre chose | L'application ne démarre pas (une faute de frappe ne bascule pas en silence).                                                                    |

Le choix est fait par `socle/db/stockage.ts` (`stockageSurPostgres`) dans les fabriques des modules.

## État de chaque module

| Module (ticket)          | Dossier            | AppModule | Ports                                                                                                                                                      | Stockage actuel                                                             |
| ------------------------ | ------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Numérotation (AM-161)    | `src/numerotation` | oui       | `PlagesAttribuees`, `RegistreNumeros`, `AlertesNumerotation`                                                                                               | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE`             |
| Modules (AM-126)         | `src/modules`      | oui       | `ReglagesModules`, `AnnuaireAgences` (`DetailsModules` reste le défaut sans détail)                                                                        | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE`             |
| Synchronisation (AM-160) | `src/sync`         | oui       | `AppareilsSync`, `JournalSync`, `SiegesSync`, `AlertesSync`, `ProvisionnementSync`                                                                         | Mémoire (`ControleNumeros`/`AttributionPlages` viennent de la numérotation) |
| Billetterie (AM-162)     | `src/billetterie`  | oui       | `Catalogue`, `Billets`, `Inventaire`, `Commandes`, `Scans`, `EvenementsTraites`, `PreferencesVoyageur`, `Promotions`, `ProchesVoyageur`, …                 | Mémoire                                                                     |
| Colis (AM-163)           | `src/colis`        | oui       | `ColisRepository`, `PhotosColis`, `ReclamationsRepository`, `FichiersPhotos`, `ReferentielColis`, `NumerotationColis`, …                                   | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE`             |
| Caisse (AM-164)          | `src/caisse`       | oui       | `SessionsCaisse`, `MouvementsCaisse`, `GuichetsAgence`, `ReglesAgence`, `AlertesPatron`, journal d'agence (`JournalAgenceRepository`, `EvenementsTraites`) | **PostgreSQL** (`postgres.ts`, `journal/postgres.ts`) ou mémoire            |
| Supervision (AM-164)     | `src/supervision`  | oui       | `RegistreBillets`, `DemandesAnnulation`, `SourceGare`, `EquipeGare`, `PinsEquipe`                                                                          | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE`             |

Le socle (comptes, authentification, audit, événements) était déjà sur PostgreSQL.

### Les tables de chaque module

| Module          | Tables (nom SQL)                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Synchronisation | `appareil_sync`, `journal_evenement`, `siege_operation`, `siege_billet`, `siege_conflit`, `alerte_sync`                                                |
| Numérotation    | `plage_attribuee`, `numero_vu`, `alerte_sync` (alertes de type `trou_dans_la_plage`)                                                                   |
| Billetterie     | `siege_depart`, `commande`, `scan_quai`, `evenement_traite`, `compagnie_preferee`, `filtres_voyageur`, et les colonnes ajoutées à `billet` et `depart` |
| Colis           | `photo_colis`, `reclamation_colis`, et les colonnes ajoutées à `colis`                                                                                 |
| Caisse          | `annulation_caisse`, `journal_agence`, `evenement_agence_traite`, `alerte_patron`, et les colonnes ajoutées à `session_caisse` et `compagnie`          |
| Supervision     | `demande_annulation`                                                                                                                                   |
| Modules         | `module_compagnie` (existait), `module_exception`                                                                                                      |

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
- **Modules** : les 12 codes du catalogue en `CHECK`, une exception par module et par gare ou par ville,
  portée cohérente (une gare nomme une gare, une ville nomme une ville).
- **Code de retrait d'un colis** (migration `…000400`) : le décompte des essais est exact parce que
  l'écriture d'un colis est un `UPDATE … WHERE id = $1 AND version = $2` d'un seul tenant : deux essais
  partis de la même version ne passent jamais tous les deux, le perdant relit et recommence
  (`ColisService.modifier`). Douze devineurs simultanés : trois essais comptés, colis bloqué. La base refuse
  en plus un colis à trois essais sans blocage ou à plus de trois essais
  (`colis_code_bloque_apres_trois_essais`, `colis_code_essais_max`). La numérotation en ligne des colis
  passe par `numero_vu`.
- **Une transition de billet ne se fait qu'une fois** : annuler ou reporter lit le billet `FOR UPDATE`,
  écrit `UPDATE billet … WHERE id AND etat = <lu>`, libère le siège (`siege_depart`) et avance
  `versionPlan` dans la même transaction. Une décision d'annulation est un compare-et-échange sur
  `demande_annulation.statut` : dix décisions simultanées, une seule passe.
- **Journal d'agence signé et chaîné** : une chaîne par compagnie ; l'ajout prend le verrou consultatif
  `7_017_164`, lit la dernière entrée, insère ; l'index unique `(chaine, precedente)` est le filet. L'identifiant
  d'événement est unique (idempotence) ; une réservation `en_cours` abandonnée depuis plus de cinq minutes est
  reprise.
- **Sessions de caisse** : les `CHECK` `session_etat_cloture`, `session_etat_validation`,
  `session_cloture_copie` et `session_validation_copie` interdisent qu'une session soit à la fois ouverte et
  clôturée, ou que les colonnes interrogeables divergent du JSON qui fait foi (voir les décisions plus bas).

## Tests

```
createdb afrimove_test       # base JETABLE : le nom finit par _test, le schéma public est vidé
DATABASE_URL_TEST=postgresql://user@localhost:5432/afrimove_test pnpm --filter @afrimove/api run test
```

Sans `DATABASE_URL_TEST`, les tests d'intégration sont ignorés (la CI actuelle n'a pas de base). Avec,
ils tournent l'un après l'autre (verrou consultatif dans `socle/testing/base-integration.ts`). Fichiers :

- `socle/db/db.integration.test.ts` : migrations, déclencheurs, contraintes du socle et des modules ;
- `socle/db/migration-modules-metier.integration.test.ts` : reprise de données déjà présentes ;
- `caisse/migration-caisse.integration.test.ts` : reprise de sessions de caisse écrites dans l'ancien format
  (JSON de clôture et de validation reconstruit) et des colis existants ;
- `numerotation/postgres.integration.test.ts` : le contrat des trois ports sur la mémoire (toujours) et
  sur PostgreSQL, les garanties de la base, les services complets, l'API avec `API_STOCKAGE=postgres` et
  un redémarrage ;
- `modules/postgres.integration.test.ts` : de même pour les modules (AM-126) ;
- `colis/postgres.integration.test.ts`, `caisse/postgres.integration.test.ts`,
  `supervision/postgres.integration.test.ts` : le contrat des ports sur la mémoire et sur PostgreSQL,
  les garanties de la base (essais du code exacts sous concurrence, une caisse ouverte par agent et par
  guichet, chaîne du journal falsifiée détectée, décisions simultanées), puis l'API de bout en bout.

Chaque nouvel adaptateur suit ce patron : **une suite de contrat écrite une fois, passée par la mémoire
et par PostgreSQL**. C'est ce qui garantit que la mémoire, sur laquelle tournent tous les autres tests,
se comporte comme la base. Les suites sont dans `numerotation/testing/contrat-ports.ts`,
`colis/testing/contrat-ports.ts`, `caisse/testing/contrat-ports.ts` et `supervision/testing/contrat-ports.ts` ;
`caisse/testing/app-agence-pg.ts` monte l'application sur PostgreSQL pour les tests de bout en bout.
Un fichier d'intégration prépare la base une seule fois (`preparerBaseDeTest` vide le schéma public) :
n'en imbriquez jamais deux dans le même fichier.

## Ce qui reste à faire, dans l'ordre

1. **Synchronisation** (`src/sync`) : adaptateurs `AppareilsSync`, `JournalSync`, `SiegesSync`,
   `AlertesSync` (partagée avec la numérotation : `alerte_sync`), `ProvisionnementSync`. `JournalSync.ajouter`
   doit répondre `null` sur conflit de l'identifiant (idempotence), comme la mémoire. À faire en premier :
   la billetterie et les colis y reçoivent leurs événements, et tant que `SyncModule` est en mémoire la
   production ne démarre pas.
2. **Billetterie** (`src/billetterie`) : `Billets`, `Inventaire` (siège : `INSERT … ON CONFLICT DO NOTHING`
   sur `siege_depart`, jamais « lire puis écrire »), `Commandes`, `Scans`, `EvenementsTraites`, préférences
   et filtres. Poser `BILLETTERIE_QR_CLE_PRIVEE` (secret). `DiffusionTempsReel`, `ConversionDevises`,
   `Promotions` et `AvisBillets` n'ont pas de table : ce sont des services externes ou des ports sans
   persistance propre à ce stade.
3. **Colis, caisse, supervision** : faits à l'étape 2b (AM-163, AM-164). Reste à brancher, quand la
   billetterie sera sur PostgreSQL, ce que la caisse lit des billets : `MouvementsCaisse.decompte` calcule
   déjà le décompte depuis `billet`, `colis` et `annulation_caisse`, donc une vente écrite par la
   billetterie PostgreSQL y apparaît sans autre code. Un billet sans paiement connu est compté comme non
   espèces (mobile money) : à confirmer avec le métier.
4. **Autres reliquats connus** (hors adaptateurs) :
   - donner un PIN de signature aux comptes patron (ils se connectent par mot de passe ; `personne.pinHache`
     est posé à la main dans les tests) ;
   - la connexion doit refuser un PIN provisoire expiré (`personne.pinProvisoireJusqua`) et imposer le
     changement à la première connexion (code du socle d'authentification) ;
   - `module_exception.creePar` n'est jamais renseigné : le port `ReglagesModules` ne porte pas l'auteur,
     la trace est le journal d'audit (`module.changer`) ;
   - protéger les routes des autres modules avec `@ModuleRequis` au fur et à mesure ;
   - exporter `ModulesActifsSchema` dans `packages/contrats` ;
   - lancer `ControleJourneeService.controler` chaque soir (aucun planificateur n'est fourni).
   - `session_caisse.historique` n'est plus écrite (reste à `[]`) : la retirer dans une migration future ;
   - les `CHECK` posés `NOT VALID` par la migration `…000400` (sessions, colis) valent pour toute écriture
     à venir ; les `VALIDATE CONSTRAINT` se feront hors ligne, après contrôle des données de production ;
   - `rouvrir` d'une demande d'annulation peut, dans une course très rare, se heurter à l'index unique
     « une seule en attente par billet » (erreur 23505) : la demande reste alors décidée, à rejouer ;
   - les textes avec un caractère NUL sont refusés par PostgreSQL : non traités à ce stade ;
   - la supervision dérive de ses tables des valeurs que les maquettes fixaient : voir « Décisions ».
5. **Quand tout est branché** : retirer `API_STOCKAGE=memoire` de tout script, vérifier qu'`API_STOCKAGE`
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
- **`compteur_colis_en_ligne` n'existe pas** : le README du module colis l'annonçait, mais le compteur du
  jour des colis en ligne est le registre `numero_vu` lui-même (genre `colis`), qui donne le plus petit
  numéro libre de la plage 4001 et suivants (`NumerotationColisServeur`, idempotent par référence). Une
  seule source de vérité, pas deux compteurs à garder d'accord.
- **Colonnes en double dans `session_caisse` (tranché à l'étape 2b)** : le JSON `cloture` et le JSON
  `validation` **font foi** (décompte, divergence de l'appareil, identifiant d'événement, commentaire du
  superviseur). Les colonnes d'origine `clotureeA`, `cashCompte`, `cashAttendu`, `ecart`, `clotureeAuto`,
  `valideeA`, `valideeParId` sont une **copie interrogeable**, écrite dans la même instruction que le JSON,
  et les `CHECK` `session_cloture_copie` et `session_validation_copie` refusent qu'elles divergent.
  `historique` est **abandonnée** (le journal d'agence signé est l'historique) et reste à `[]`. Aucune
  colonne n'est supprimée (migrations additives). La migration reconstruit le JSON des sessions déjà
  clôturées ou validées depuis les colonnes d'origine (décompte à zéro, identifiant d'événement tiré au
  hasard) ; testé par `caisse/migration-caisse.integration.test.ts`.
- **Tolérance d'écart de caisse** : `compagnie.toleranceEcartCaisse` (nullable, positive) remplace une
  valeur fixe ; `ReglesAgence` la lit, avec 1 000 F quand elle est absente.
- **Identifiants non UUID** : les adaptateurs PostgreSQL répondent « identifiant invalide » au lieu de
  laisser PostgreSQL lever une erreur de conversion ; les services le traduisent en HTTP 422
  `IDENTIFIANT_INVALIDE`. Les tests en mémoire gardent leurs identifiants de texte (« dem-1 »).
- **Vue de la gare dérivée des tables (supervision)** : quais = plus grand quai des départs du jour ;
  « synchronisé » = dernière synchronisation de moins de 15 minutes (appareils non retirés) ; « après-midi »
  = départs non annulés à partir de 12 h à Douala ; un départ sans quai affiche le quai 1 et sans bus une
  capacité de 1 (le contrat exige au moins 1) ; `fusionProposeeAvec` est toujours `null` (aucune table de
  fusion) ; `annulationsAgent` compte les demandes faites par l'agent sur 10 jours, la moyenne étant par
  guichet de la gare ; un billet de cadence sans nom s'affiche « Voyageur sans nom ».
- **Reprise d'un événement d'agence** : une réservation d'idempotence `en_cours` plus vieille que cinq
  minutes (traitement interrompu) est reprise par l'événement suivant de même identifiant.
- **Les jours** : toutes les dates de jour sont des `AAMMJJ` en heure de Douala (UTC+1,
  sans heure d'été), calculés par `versIsoDouala` ; la reprise de `colis.jour` fait le même calcul en SQL.
- **Verrous consultatifs** : `pg_advisory_xact_lock(int, int)` avec un espace par usage (numérotation :
  `7_017_161`, journal d'agence et caisse : `7_017_164`, tests d'intégration : `7_017_999`). Un nouvel adaptateur qui prend un verrou choisit un
  nouvel espace, pour ne pas bloquer un autre module.
