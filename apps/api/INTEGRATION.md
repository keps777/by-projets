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
  module sont montées ; les tests e2e existants passent toujours. Étape 3 : le GPS (AM-170), la
  passerelle WhatsApp (AM-167), les paiements (AM-165), le rapport du soir (AM-171), la connexion du
  voyageur (AM-023), l'USSD (AM-169), l'achat par WhatsApp (AM-168), le covoiturage (AM-054), les relais et
  la livraison moto (AM-148) y sont branchés avec leurs adaptateurs en mémoire (voir « Étape 3 »
  plus bas). `socle/demarrage.e2e.test.ts` démarre l'application entière et vérifie que chaque garde-fou de
  production refuse toujours un port en mémoire.
- **Quatorze modules ont leurs adaptateurs PostgreSQL** : la numérotation, les modules (AM-126), la
  synchronisation (AM-160), la billetterie (AM-162, quatre ports ajoutés au lot B), le journal des SMS
  (AM-166), les colis (AM-163), la caisse et la supervision (AM-164), puis, au **lot B**, le covoiturage
  (AM-054), les relais et la livraison moto (AM-148), les vendeurs ambulants, le financement (AM-134) et les
  inter-agences (AM-135). Financement, inter-agences et vendeurs sont maintenant dans `AppModule`.
- **Conséquence en production** : l'API **refuse de démarrer** avec `NODE_ENV=production` tant qu'un module a
  un port en mémoire ou simulé (leur `Verification*` fait son travail ; la liste des ports qui restent est dans
  « Ce qui manque encore pour la production »). C'est voulu : aucune donnée métier ne doit se perdre au
  redémarrage. En développement et en test, rien ne change.
- **Migrations** : trois de plus, `20261017000400_sms_et_heure_texte` (tables `sms_message` et
  `sms_essai`, colonne `journal_evenement.atTexte` : l'heure telle que l'appareil l'a signée) et
  `20261017000500_sms_garanties` (CHECK, index unique partiel sur le fournisseur, essais en ajout seul), puis, à l'étape 2b,
  `20261017000600_colis_caisse_supervision_garanties` (alertes du patron, tolérance d'écart, choix des
  colonnes en double de `session_caisse`, garde-fous des colis). Le **lot B** a pris la plage
  `20261017000800` à `…899` : `…800_billetterie_reliquats`, `…801_covoiturage`, `…802_relais`,
  `…803_livraison`, `…804_vendeurs`, `…805_financement`, `…806_inter_agences`. Leurs modèles sont en bloc à la
  fin de `schema.prisma`, sous un commentaire « lot B » ; les garde-fous SQL (clés étrangères vers les tables
  existantes, `CHECK`, index uniques partiels, déclencheurs d'ajout seul) sont écrits dans la même migration.

## Choisir le stockage : `API_STOCKAGE`

| Valeur      | Effet                                                                                                                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| absente     | PostgreSQL si `NODE_ENV=production`, mémoire sinon (les tests restent en mémoire sans rien régler).                                                                                                                                                                   |
| `postgres`  | Les modules qui ont des adaptateurs PostgreSQL les utilisent (numérotation, modules, synchronisation, billetterie, journal des SMS, colis, caisse, supervision, covoiturage, relais, livraison, vendeurs, financement, inter-agences), quel que soit l'environnement. |
| `memoire`   | Mémoire partout (en production, le garde-fou refuse alors de démarrer).                                                                                                                                                                                               |
| autre chose | L'application ne démarre pas (une faute de frappe ne bascule pas en silence).                                                                                                                                                                                         |

Le choix est fait par `socle/db/stockage.ts` (`stockageSurPostgres`) dans les fabriques des modules.

## État de chaque module

| Module (ticket)             | Dossier              | AppModule   | Ports                                                                                                                                                                                                                                                                                                 | Stockage actuel                                                                                                 |
| --------------------------- | -------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Numérotation (AM-161)       | `src/numerotation`   | oui         | `PlagesAttribuees`, `RegistreNumeros`, `AlertesNumerotation`                                                                                                                                                                                                                                          | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE`                                                 |
| Modules (AM-126)            | `src/modules`        | oui         | `ReglagesModules`, `AnnuaireAgences` (`DetailsModules` reste le défaut sans détail)                                                                                                                                                                                                                   | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE`                                                 |
| Synchronisation (AM-160)    | `src/sync`           | oui         | `AppareilsSync`, `JournalSync`, `SiegesSync`, `AlertesSync`, `ProvisionnementSync`                                                                                                                                                                                                                    | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE` (`ProvisionnementSync` : `ProvisionnementVide`) |
| Billetterie (AM-162)        | `src/billetterie`    | oui         | `Catalogue`, `Billets`, `Inventaire`, `Commandes`, `Scans`, `EvenementsTraites`, `PreferencesVoyageur`, `NumerotationEnLigne`, `Promotions`, `ProchesVoyageur`, `ColisDuDepart`, `AvisBillets` (lot B, `postgres-annexes.ts`) ; hors base : `ConversionDevises`, `DiffusionTempsReel`, `SignataireQr` | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE`                                                 |
| SMS (AM-166)                | `src/sms`            | oui         | `JournalSms` (PostgreSQL) ; `FileEnvoiSms` (BullMQ + Redis, à écrire)                                                                                                                                                                                                                                 | Journal **PostgreSQL** (`postgres.ts`) ou mémoire ; file en mémoire                                             |
| Colis (AM-163)              | `src/colis`          | oui         | `ColisRepository`, `PhotosColis`, `ReclamationsRepository`, `FichiersPhotos`, `ReferentielColis`, …                                                                                                                                                                                                   | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE`                                                 |
| Caisse (AM-164)             | `src/caisse`         | oui         | `SessionsCaisse`, `MouvementsCaisse`, `GuichetsAgence`, `ReglesAgence`, `AlertesPatron`, journal d'agence (`JournalAgenceRepository`, `EvenementsTraites`)                                                                                                                                            | **PostgreSQL** (`postgres.ts`, `journal/postgres.ts`) ou mémoire, selon `API_STOCKAGE`                          |
| Supervision (AM-164)        | `src/supervision`    | oui         | `RegistreBillets`, `DemandesAnnulation`, `SourceGare`, `EquipeGare`, `PinsEquipe`                                                                                                                                                                                                                     | **PostgreSQL** (`postgres.ts`) ou mémoire, selon `API_STOCKAGE`                                                 |
| GPS (AM-170)                | `src/gps`            | oui (3)     | stockage, `PrevenirProches`, `AvisSuivi`, `DiffusionGps`, sources des bus et des livreurs                                                                                                                                                                                                             | Mémoire (le garde-fou refuse la production)                                                                     |
| WhatsApp (AM-167)           | `src/whatsapp`       | oui (3)     | journal, file, fournisseur, `SecoursSms` (**branché sur la passerelle SMS**), `SourceRapportSoir` et `AnnuaireRapport` (**branchés**), `GestionnaireEntrants` (**branché sur l'achat**)                                                                                                               | Mémoire + fournisseur simulé                                                                                    |
| Paiements (AM-165)          | `src/paiements`      | oui (3)     | transactions, remboursements, liens, comptes de reversement, réglages ; billetterie par ses ports                                                                                                                                                                                                     | Mémoire + agrégateur simulé                                                                                     |
| Rapport du soir (AM-171)    | `src/rapport`        | oui (3)     | `CaissesDuJour`, `AnnulationsDuJour`, `TrousNumerotation`, `ControlesEnRoute`, `RapportsSoir` ; lit les modules existants (`avecModulesExistants`)                                                                                                                                                    | Mémoire pour `RapportsSoir` (le reste lit les tables existantes)                                                |
| Connexion voyageur (AM-023) | `src/auth-voyageur`  | oui (3)     | codes et essais, fiches voyageur, `EnvoiCodeSms` (**branché sur la passerelle SMS**, type `code_connexion`)                                                                                                                                                                                           | Mémoire                                                                                                         |
| USSD (AM-169)               | `src/ussd`           | oui (3)     | sessions, journal, achats, `NotifieurBilletUssd` ; la billetterie et les paiements par leurs ports                                                                                                                                                                                                    | Mémoire                                                                                                         |
| Achat WhatsApp (AM-168)     | `src/whatsapp-achat` | oui (3)     | conversations, journal, achats, `MessagerieAchat` (via la passerelle WhatsApp), `ReconnaissanceEquipe` (**branchée** sur les comptes)                                                                                                                                                                 | Mémoire                                                                                                         |
| Covoiturage (AM-054)        | `src/covoiturage`    | oui (3)     | trajets, réservations, dossiers conducteur, versements, demandes, notes, trajets réguliers, référentiel des lignes, `PasserelleVersements`                                                                                                                                                            | **PostgreSQL** (lot B) ou mémoire ; `PasserelleVersements` simulée                                              |
| Relais (AM-148)             | `src/relais`         | oui (3)     | relais, demandes, brouillons, compteurs, réceptions, `Portefeuille`, `AttributionRoles` (PostgreSQL) ; `Lieux`, `VersementsMobile` (simulés) ; répond à `ReferentielColis.relais`                                                                                                                     | **PostgreSQL** (lot B) ou mémoire ; `Lieux` et `VersementsMobile` simulés                                       |
| Livraison moto (AM-148)     | `src/livraison`      | oui (3)     | livreurs, demandes, missions, partages de suivi, invitations (PostgreSQL) ; `DiffusionLivraison`                                                                                                                                                                                                      | **PostgreSQL** (lot B) ou mémoire ; `DiffusionLivraison` en mémoire                                             |
| Vendeurs ambulants          | `src/vendeurs`       | oui (lot B) | vendeurs, agréments, numéros, ventes, commissions, comptes (PostgreSQL) ; `VersementsMobile`                                                                                                                                                                                                          | **PostgreSQL** (lot B) ou mémoire ; `VersementsMobile` simulé                                                   |
| Financement (AM-134)        | `src/financement`    | oui (lot B) | dossiers, prélèvements, lots de paie, réglages, conventions, offres de crédit (PostgreSQL) ; `PartenaireFinancier`, `VersementsPaie`, `DonneesAgence`, `SalairesAgence`                                                                                                                               | **PostgreSQL** (lot B) ou mémoire ; les quatre autres ports simulés                                             |
| Inter-agences (AM-135)      | `src/inter-agences`  | oui (lot B) | conventions, colis et billets en correspondance, règlements, contestations, invitations, références, annuaire, départs, billets émis (PostgreSQL) ; `ReglementsMobile`                                                                                                                                | **PostgreSQL** (lot B) ou mémoire ; `ReglementsMobile` simulé                                                   |

Le socle (comptes, authentification, audit, événements) était déjà sur PostgreSQL.

### Les tables de chaque module

| Module                | Tables (nom SQL)                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synchronisation       | `appareil_sync`, `journal_evenement` (avec `atTexte`), `siege_operation`, `siege_billet`, `siege_conflit`, `alerte_sync`                                                                                                                                              |
| Numérotation          | `plage_attribuee`, `numero_vu`, `alerte_sync` (alertes de type `trou_dans_la_plage`)                                                                                                                                                                                  |
| Billetterie           | `siege_depart`, `commande`, `scan_quai`, `evenement_traite`, `compagnie_preferee`, `filtres_voyageur`, et les colonnes ajoutées à `billet` et `depart`                                                                                                                |
| Colis                 | `photo_colis`, `reclamation_colis`, et les colonnes ajoutées à `colis`                                                                                                                                                                                                |
| Caisse                | `annulation_caisse`, `journal_agence`, `evenement_agence_traite`, `alerte_patron`, et les colonnes ajoutées à `session_caisse` et `compagnie`                                                                                                                         |
| Supervision           | `demande_annulation`                                                                                                                                                                                                                                                  |
| Modules               | `module_compagnie` (existait), `module_exception`                                                                                                                                                                                                                     |
| SMS                   | `sms_message`, `sms_essai`                                                                                                                                                                                                                                            |
| Billetterie (lot B)   | `promotion`, `proche_voyageur`, `avis_billetterie` (`colis` est lu par `ColisDuDepart`)                                                                                                                                                                               |
| Covoiturage (lot B)   | `trajet_covoiturage`, `vue_trajet_covoiturage`, `reservation_covoiturage`, `dossier_conducteur`, `piece_conducteur`, `versement_covoiturage`, `demande_covoiturage`, `proposition_covoiturage`, `note_covoiturage`, `trajet_regulier_passager`, `conseil_covoiturage` |
| Relais (lot B)        | `relais`, `demande_relais`, `brouillon_relais`, `compteur_dossier` (aussi pour les vendeurs, les inter-agences), `reception_relais`, `credit_partenaire`, `debit_partenaire`, `coordonnees_gare`, `adresse_geolocalisee`                                              |
| Livraison (lot B)     | `livreur`, `demande_livreur`, `mission_livraison`, `partage_suivi`, `invitation_livreur`                                                                                                                                                                              |
| Vendeurs (lot B)      | `vendeur`, `agrement_vendeur`, `vente_vendeur`, `credit_commission_vendeur`, `debit_commission_vendeur`                                                                                                                                                               |
| Financement (lot B)   | `dossier_financement`, `compteur_avance`, `prelevement_avance`, `lot_paie`, `ligne_paie`, `reglage_financement`, `convention_financement`, `offre_credit_materiel`                                                                                                    |
| Inter-agences (lot B) | `convention_inter_agences`, `signature_convention`, `colis_inter_agences`, `billet_correspondance`, `reglement_inter_agences`, `creance_reglee`, `contestation_reglement`, `invitation_compagnie`, `compte_momo_compagnie`                                            |

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

### Garanties du lot B

Chacune est tenue par la base et vérifiée par un test qui écrit en SQL direct ou lance les requêtes ensemble.

- **Une seule demande en cours** : un seul dossier de financement ouvert par agence, une seule convention
  inter-agences ouverte par paire de compagnies quel que soit l'ordre (index unique partiel sur
  `LEAST`/`GREATEST`), une seule demande de relais ou de livreur ouverte par personne, une seule mission ouverte
  par colis, une seule réservation de covoiturage en cours par passager et par trajet (index uniques partiels).
- **Jamais de double paiement** : `creance_reglee` (clé primaire = créance) ; un règlement par `cle` ; un
  prélèvement exécuté ne se modifie ni ne se supprime ; une commission, un versement ou un salaire ne se crédite
  qu'une fois (clé d'idempotence ou d'unicité, `ON CONFLICT DO NOTHING`).
- **Pas de montant négatif ni de places en trop** : `CHECK` sur les montants et les places d'un trajet de
  covoiturage ; les écritures qui touchent aux places verrouillent la ligne du trajet (`FOR UPDATE`).
- **Numéros sans trou ni doublon** : `compteur_dossier`, `compteur_avance` et les numéros de vendeurs par
  `INSERT … ON CONFLICT DO UPDATE … RETURNING`.
- **Ce qui est clos ne change plus** : règlement payé, contestation tranchée, prélèvement exécuté, signature,
  créance réglée, invitation, avis de billetterie (déclencheurs `interdire_modification`). Les conventions,
  dossiers, lots de paie et règlements ne se suppriment pas (ni `TRUNCATE`).
- **Rien d'identifiant en clair** : téléphones et noms des voyageurs, proches, salariés, invitations, numéros
  MoMo, par `ChiffrementService` (un contexte par colonne, lié comme donnée authentifiée).
- **Rejeu et concurrence** : `UPDATE … WHERE id AND version` (ou `AND etat`) partout où deux requêtes peuvent
  se croiser ; les listes sont triées de la même façon en mémoire et en base.

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
- `sync/postgres.integration.test.ts` : le contrat des cinq ports de la synchronisation, ajout seul,
  idempotence par UUID d'événement, six lots identiques simultanés, deux guichets sur le même siège,
  l'API avec `API_STOCKAGE=postgres` et un redémarrage ;
- `billetterie/postgres.integration.test.ts` : le contrat des ports de la billetterie, siège jamais vendu
  deux fois (requêtes simultanées), double scan refusé, numéros en ligne sans trou, l'API de bout en bout ;
- `sms/postgres.integration.test.ts` : le contrat du journal, clé d'idempotence, statuts conditionnels,
  essais en ajout seul, aucun texte stocké, l'API (billet, accusé signé en corps brut, reprise,
  redémarrage) ;
- `colis/postgres.integration.test.ts`, `caisse/postgres.integration.test.ts`,
  `supervision/postgres.integration.test.ts` : le contrat des ports sur la mémoire et sur PostgreSQL,
  les garanties de la base (essais du code exacts sous concurrence, une caisse ouverte par agent et par
  guichet, chaîne du journal falsifiée détectée, décisions simultanées), puis l'API de bout en bout ;
- lot B : `billetterie/postgres-annexes.integration.test.ts`, puis, pour chaque module,
  `covoiturage/`, `relais/`, `livraison/`, `vendeurs/`, `financement/` et `inter-agences/`
  `postgres.integration.test.ts` (le contrat des ports sur la mémoire et sur PostgreSQL, puis les garanties de
  la base) et `api.postgres.integration.test.ts` (toute l'application sur PostgreSQL, un scénario complet, puis un
  redémarrage). Le montage de l'application sur PostgreSQL et les fixtures (compagnies, gares, lignes, bus, départs, billets,
  personnes) sont dans `relais/testing/fixtures-pg.ts`. Base du lot :
  `afrimove_lotB_test`.

Chaque nouvel adaptateur suit ce patron : **une suite de contrat écrite une fois, passée par la mémoire
et par PostgreSQL**. C'est ce qui garantit que la mémoire, sur laquelle tournent tous les autres tests,
se comporte comme la base. Les suites sont dans `numerotation/testing/contrat-ports.ts`, `sync/testing/contrat-ports.ts`,
`billetterie/testing/contrat-ports.ts` (et `contrat-annexes.ts`) et `sms/testing/contrat-journal.ts`, `covoiturage/`, `relais/`, `livraison/`, `vendeurs/`, `financement/` et `inter-agences/testing/contrat-ports.ts`, `colis/testing/contrat-ports.ts`, `caisse/testing/contrat-ports.ts` et `supervision/testing/contrat-ports.ts` ; `caisse/testing/app-agence-pg.ts` monte l'application sur PostgreSQL pour les tests de bout en bout. Un fichier d'intégration prépare la base une seule fois (`preparerBaseDeTest` vide le schéma public) : n'en imbriquez jamais deux dans le même fichier.

## Ce qui reste à faire, dans l'ordre

1. **Fait : synchronisation** (`src/sync/postgres.ts`) et **billetterie** (`src/billetterie/postgres.ts`,
   `postgres-annexes.ts` au lot B : promotions, proches, colis du départ, avis). Reste : poser
   `BILLETTERIE_QR_CLE_PRIVEE` (secret). `ProvisionnementSync` est branché sur `ProvisionnementVide`
   (aucune part de sièges hors ligne, aucun vérificateur de PIN) : il faudra le rebrancher sur la
   billetterie et les comptes quand l'appareil devra valider un déblocage sur place.
2. **Fait : journal des SMS** (`src/sms/postgres.ts`). Reste la **file d'envoi** (`FileEnvoiSms` sur
   BullMQ + Redis, voir `src/sms/README.md`) : sans elle `SmsModule` refuse de démarrer en production.
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
5. **Fait (lot B) : covoiturage, relais, livraison, vendeurs, financement, inter-agences.** Il reste, par
   module, les ports qui parlent à l'extérieur (voir le tableau ci-dessous) : opérateurs MoMo et Orange Money
   (`PasserelleVersements`, `VersementsMobile`, `VersementsPaie`, `ReglementsMobile`), partenaire financier,
   géocodage (`Lieux`), diffusion de la livraison, données de l'agence et salaires.
6. **Quand tout est branché** : retirer `API_STOCKAGE=memoire` de tout script, vérifier qu'`API_STOCKAGE`
   absent + `NODE_ENV=production` démarre, et ajouter un test e2e de bout en bout sur PostgreSQL (un billet
   vendu hors ligne, synchronisé, compté en caisse).

## Étape 3 : modules branchés dans `AppModule`

Ce qui est câblé (tout en mémoire, pour le développement et les tests ; aucun garde-fou de production n'a
été affaibli, `socle/demarrage.e2e.test.ts` le vérifie module par module) :

- **Modules importés** : `GpsModule`, `PaiementsModule`, `UssdModule`, `CovoiturageModule`, `RelaisModule`,
  `LivraisonModule`, plus quatre modules dynamiques construits dans `app.module.ts` : `authVoyageur`,
  `rapport` (`avecModulesExistants()`), `achatWhatsApp` et `whatsApp`. Le même objet `achatWhatsApp` est
  donné à `WhatsAppModule` : une seule instance (une file, un état de conversations).
- **Branchements entre modules** (adaptateurs de production, pas de test) :
  - WhatsApp : `SecoursSms` → passerelle SMS (`SecoursSmsPasserelle`), `SourceRapportSoir` → module rapport,
    `AnnuaireRapport` → comptes (patron puis superviseurs actifs), `GestionnaireEntrants` → achat
    conversationnel ;
  - achat WhatsApp : `ReconnaissanceEquipe` → comptes (`EquipeAnnuaire`) ; `GESTIONNAIRE_SUIVANT` (l'assistant
    du patron, AM-104) n'existe pas encore : sans lui, les messages de l'équipe (patron, superviseurs) reçus par WhatsApp sont ignorés par l'achat ;
  - connexion voyageur : `EnvoiCodeSms` → passerelle SMS ;
  - billetterie ↔ paiements : références circulaires de modules (`forwardRef` des deux côtés), aucun cycle
    entre fournisseurs ; la billetterie lit le taux de change de l'agrégateur (`useExisting`) ;
  - colis ↔ relais : `ReferentielColis.relais` interroge les relais (`BranchementRelaisColis`), avec repli sur
    l'ancien référentiel quand les relais n'ont pas de réponse.
- **Routes en double retirées** : la connexion du voyageur n'existe plus qu'à `/voyageur/connexion/*`
  (module auth-voyageur). `POST /auth/voyageur/*` et ses méthodes (`AuthService`, DTO) ont été supprimées ;
  `/auth/guichet/*` et `/auth/direction/*` ne changent pas. Aucun client du dépôt n'appelait les anciennes routes.
- **SMS `code_connexion`** (migration `20261017000700_sms_code_connexion`, qui refait le `CHECK`
  `sms_message_type_connu`) : le gabarit garde les sauts de ligne (alphabet GSM-7) et finit par
  `@<domaine> #<code>` pour WebOTP ; sensible (validité 5 min), urgent, et hors de la limite par destinataire
  et par heure (comme `systeme`) puisque le module de connexion a déjà ses propres limites. Le test
  `it.fails` d'auth-voyageur est devenu un test normal. Le gabarit WhatsApp du code n'est pas écrit
  (il demande un gabarit Meta approuvé : voir plus bas).
- **Codes sans frais** : des promotions USSD et WhatsApp existent en mémoire (`billetterie/memoire.ts`) pour
  que les canaux se montent ; les tests « sans promotion » les retirent (`Promotions.retirer`).

### Ce qui manque encore pour la production

Chaque module ci-dessous refuse de démarrer avec `NODE_ENV=production` tant que le port nommé est en
mémoire ou simulé :

| Module             | À écrire                                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GPS                | adaptateurs PostgreSQL du stockage, `PrevenirProches`, `AvisSuivi`, `DiffusionGps` ; les sources des bus (départs, chauffeur) et des livreurs (README `src/gps`)                                                           |
| Paiements          | PostgreSQL pour transactions, remboursements, notifications traitées, liens, comptes de reversement, réglages ; clés de l'agrégateur ; compte de séquestre (variable d'environnement, voir le README)                      |
| Rapport du soir    | `RapportsSoir` et le reste des ports en PostgreSQL (README `src/rapport`)                                                                                                                                                  |
| WhatsApp           | journal, file BullMQ + Redis, fournisseur Meta réel (jeton, secret de signature) ; gabarit Meta du code de connexion (non écrit) ; l'assistant du patron                                                                   |
| Achat WhatsApp     | conversations, journal et achats en PostgreSQL ; `MessagerieAchat` sur le fournisseur réel                                                                                                                                 |
| Connexion voyageur | codes/essais (Redis ou PostgreSQL) et fiches voyageur ; le SMS part déjà par la passerelle (dont la file BullMQ reste à écrire)                                                                                            |
| USSD               | sessions (Redis, avec expiration), journal et achats PostgreSQL, `NotifieurBilletUssd` (SMS du billet), jetons des connecteurs MTN et Orange                                                                               |
| Covoiturage        | décaissement MoMo réel (`PasserelleVersements`, simulée) ; le reste est sur PostgreSQL (lot B)                                                                                                                             |
| Relais             | `Lieux` (géocodage) et `VersementsMobile` (retrait MoMo des relais), simulés ; le reste est sur PostgreSQL (lot B)                                                                                                         |
| Livraison          | `DiffusionLivraison` (suivi en direct, en mémoire) ; le reste est sur PostgreSQL (lot B)                                                                                                                                   |
| Vendeurs           | `VersementsMobile` (retrait MoMo des commissions, simulé) ; le reste est sur PostgreSQL (lot B)                                                                                                                            |
| Financement        | `PartenaireFinancier` (aucun établissement choisi), `VersementsPaie` (AM-165), `DonneesAgence`, `SalairesAgence` ; le reste est sur PostgreSQL (lot B)                                                                     |
| Inter-agences      | `ReglementsMobile` (paiement MoMo / Orange Money du solde net, AM-165) et la saisie des comptes MoMo des compagnies ; le reste est sur PostgreSQL (lot B)                                                                  |
| Transverse         | la **file d'envoi BullMQ + Redis** (SMS et WhatsApp) ; `BILLETTERIE_QR_CLE_PRIVEE` ; la table `promotion` existe, mais les codes sans frais USSD/WhatsApp n'y sont pas insérés : à créer en base avant d'ouvrir ces canaux |

### Décisions à confirmer

1. **Preuve du PIN de supervision (AM-091)** : l'écart est confirmé. Le client calcule une signature locale
   (PBKDF2 puis HMAC, 64 hexadécimaux) que le serveur ne peut pas vérifier : il ne connaît pas le PIN en clair
   et la dérivation du client n'est pas la sienne. Le serveur, lui, vérifie le PIN (argon2) à
   `POST /agence/superviseur/pin` et rend une **preuve de 72 hexadécimaux** (horodatage + HMAC dérivé du
   poivre). **Choix : on garde la preuve du serveur** (seule vérifiable, rejouable seulement dans sa fenêtre) ;
   c'est le client AM-091 qui doit changer : demander la preuve au serveur quand il est en ligne et la
   transmettre telle quelle. Hors périmètre de cette étape (`apps/api` seul). À confirmer avec l'équipe
   mobile.
2. **`GET /patron/controle/bus`** (salle de contrôle GPS) est ouverte aux superviseurs en plus de l'espace
   patron, parce que l'alerte d'arrêt anormal leur est destinée. C'est une exception au principe
   « `/patron/**` réservé à l'espace patron », écrite dans `roles.e2e.test.ts` : à confirmer avec le produit.
3. **Connexion du voyageur à `/voyageur/connexion/*`** : les routes `/auth/voyageur/*` ont été supprimées au
   lieu d'être gardées comme alias ; à confirmer si un client déjà publié les appelle.
4. **Limite horaire du code de connexion** : le code de connexion n'est pas compté dans la limite horaire de la passerelle
   SMS (le module de connexion limite déjà les demandes) ; si on préfère une double limite, retirer
   `code_connexion` de l'exemption dans `sms/passerelle.service.ts`.

### Décisions du lot B à confirmer

1. **Rôles relais et livreur, sans PIN** : `AttributionRolesPrisma` donne le rôle à un compte voyageur, mais ne
   pose pas de PIN (ces rôles se connectent par PIN). Seuls les vendeurs reçoivent un PIN à l'agrément. À décider :
   PIN provisoire envoyé par SMS comme pour les vendeurs, ou connexion par un autre moyen.
2. **Code 409 `compte_inactif`** (agrément d'un vendeur sur un compte désactivé) : code inventé, absent des contrats.
3. **Nom du vendeur chiffré** et numéros de vendeurs tirés de `compteur_dossier` (une seule table de compteurs
   pour les relais, les vendeurs et les références d'inter-agences).
4. **Mission de livraison → colis** : la clé étrangère vers `colis` est plus stricte que la mémoire (la mémoire
   acceptait une mission sans colis réel).
5. **Financement** : `lot_paie.version` n'est pas incrémentée (aucune écriture ne la lit) ; dossiers et lots ne se
   suppriment pas ; les `personneId` des salaires doivent être de vrais comptes (clé étrangère).
6. **Inter-agences** : `compte_momo_compagnie` n'a aucune route d'écriture ; `AnnuaireCompagnies` rend le nom
   complet de la compagnie ; le calcul `interAgencesDisponible` du référentiel des
   colis vient désormais des conventions en vigueur (les tests de colis repilotent l'indicateur en mémoire) ;
   `prochain` ignore les départs annulés ou fusionnés ; un billet sans téléphone donne un téléphone vide.
7. **`db.integration.test.ts`** lit désormais la liste des migrations dans le dossier (la liste écrite à la main
   se périmait à chaque ajout).
8. **Garde-fous de production** : la garde des vendeurs refuse aussi `VersementsMobile` ; celle de
   l'inter-agences refuse `ReglementsMobile` ; elles sont dans `socle/demarrage.e2e.test.ts`.

### Textes inventés à relire

- Le SMS `code_connexion` : « AfriMove : ton code est 1234. Valable 5 min. Personne d'AfriMove ne te le
  demandera jamais. » puis la ligne `@<domaine> #1234`.
- Le libellé du type dans l'interface SMS : « Code de connexion du voyageur ».
- Les codes promotionnels `USSD` et `WHATSAPP` (« frais offerts »), en mémoire dans `billetterie/memoire.ts`,
  pour le développement et les tests seulement.

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
- **`SmsGateway` dans l'application** : `AuthModule` fournit `SmsGatewayPasserelle` (file, reprise,
  secours, journal) sauf avec `NODE_ENV=test`, où le simulateur `SmsMock` du socle reste en place parce que
  les helpers de test du socle, de la caisse et des colis lisent sa boîte (`messages()`, `dernier()`). La
  passerelle est testée dans `src/sms`. Un code de connexion mis en file ne fait donc plus échouer la
  connexion si aucun SMS ne peut partir (voir `src/sms/README.md`).
- **`main.ts`** crée l'application avec `rawBody: true` : le webhook des accusés SMS signe le corps exact.
- **Heure d'origine du journal de synchronisation** : `journal_evenement.atTexte` garde l'heure telle que
  l'appareil l'a écrite (la signature porte sur ce texte) ; `at` en est la valeur horodatée.
- **Verrous consultatifs** : `pg_advisory_xact_lock(int, int)` avec un espace par usage (numérotation :
  `7_017_161`, billetterie : `7_017_162`, journal d'agence et caisse : `7_017_164`, tests d'intégration : `7_017_999`). Un nouvel adaptateur qui prend un verrou choisit un
  nouvel espace, pour ne pas bloquer un autre module.
