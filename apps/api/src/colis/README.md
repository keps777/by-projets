# Colis (AM-163)

Module Nest `ColisModule` : envoi de colis depuis l'app, enregistrement et dépôt au guichet, scans de la
chaîne (chargement, route, arrivée, remise), code de retrait, photos, assurance, complément de poids,
réclamations et indemnisation.

Le module est autonome : tous ses accès extérieurs sont des **ports** (classes abstraites, `ports.ts`) avec une
version **en mémoire** (`memoire.ts`) et une version **PostgreSQL** (`postgres.ts`, Prisma). Il est branché
dans `AppModule` ; `API_STOCKAGE` choisit l'une ou l'autre (voir `apps/api/INTEGRATION.md`).

## Brancher le module

1. Fait : `ColisModule` est dans les `imports` de `AppModule`.
2. Fait : les adaptateurs PostgreSQL `ColisPrisma`, `PhotosColisPrisma`, `ReclamationsColisPrisma` et
   `NumerotationColisServeur` sont choisis par `ColisModule` quand `stockageSurPostgres(config)` est vrai.
   En production, `VerificationPortsColis` **refuse de démarrer** tant qu'un port est en mémoire ou simulé
   (`durable === false`) : restent en mémoire `FichiersPhotos`, les paiements, l'assureur, l'analyse de
   photo, la diffusion du suivi et le référentiel (départs, gares, guichets).
3. Fait : les tables sont dans `prisma/schema.prisma` et les migrations (voir la section suivante).
4. Brancher la diffusion du suivi en direct sur le futur WebSocket (voir « Reste à faire »).

Les tests passent la même suite de contrat sur la mémoire et sur PostgreSQL
(`testing/contrat-ports.ts`, `postgres.integration.test.ts`, ignoré sans `DATABASE_URL_TEST`).

Le SMS passe par `SmsGateway` du socle (`NotificationsColisSms`). WhatsApp n'a pas de fournisseur : un envoi
demandé par WhatsApp part par SMS et l'accusé le dit.

## Routes

Les noms d'opérations et les schémas sont ceux de `@afrimove/contrats` (`colis`, `agence`) et de
`@afrimove/api-client`. Chaque réponse est validée avec le schéma zod dans les tests e2e.

| Route                               | Rôle                                  | Contrat                                         |
| ----------------------------------- | ------------------------------------- | ----------------------------------------------- |
| `GET /colis/options-envoi`          | voyageur                              | `SchemaOptionsEnvoiColis`                       |
| `POST /colis/photo`                 | voyageur                              | `SchemaEstimationPhoto`                         |
| `GET /colis/devis`                  | voyageur                              | `SchemaDemandeDevisColis` (requête)             |
| `POST /colis`                       | voyageur                              | `SchemaDemandeCreationColis`, `SchemaColisCree` |
| `GET /colis/:colisId`               | voyageur (expéditeur ou destinataire) | `SchemaColisProprietaire`                       |
| `POST /colis/:colisId/code/envoi`   | voyageur                              | `SchemaAccuseEnvoiCode`                         |
| `POST /colis/:colisId/reclamations` | voyageur                              | `SchemaReclamationOuverte`                      |
| `PUT /colis/:colisId/mode`          | voyageur                              | `SchemaModeChange`                              |
| `GET /agence/colis/formulaire`      | guichetier                            | `GuichetColis`, `SchemaColisFormulaire`         |
| `GET /agence/colis/depot?code=`     | guichetier                            | `Depot`, `SchemaColisDepot`                     |
| `POST /agence/colis`                | guichetier                            | événement `colis.enregistre`                    |
| `POST /agence/colis/depot`          | guichetier                            | événement `colis.depose`, `SchemaResultatDepot` |
| `POST /agence/bus/dechargements`    | convoyeur                             | événement `route.colis_decharges`               |

Routes **ajoutées**, absentes des contrats (à confirmer ou à déplacer dans les contrats) :

| Route                                          | Rôle                                          | Usage                                                             |
| ---------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| `POST /agence/colis/scans`                     | guichetier, convoyeur, chauffeur, superviseur | une action de la machine d'états, réponse `SchemaColisPartenaire` |
| `POST /agence/colis/:colisId/deblocage`        | superviseur                                   | débloquer après trois codes faux (204)                            |
| `GET /reclamations-colis`                      | patron, superviseur, afrimove                 | lister les réclamations                                           |
| `POST /reclamations-colis/:reference/decision` | patron, superviseur, afrimove                 | accepter (indemniser) ou refuser                                  |

Corps d'erreur : `{ code, message, details? }`. Codes en minuscules côté voyageur (`code_invalide`,
`code_bloque`…), en majuscules côté agence (`TRANSITION_INTERDITE`, `COLIS_INCONNU`…).

## Règles appliquées

- **Machine d'états** : celle de `@afrimove/domain` (13 états, 12 actions), recopiée dans `regles.ts` car l'API
  ne peut pas importer les paquets non compilés. `parite.test.ts` compare chaque couple (état, action), les tarifs,
  le devis, les codes, les numéros et les heures de Douala au domaine ; les lecteurs écrits à la main sont aussi
  comparés aux schémas zod des contrats.
- **Numérotation** `C-GARE-AAMMJJ-NNNN` : plage du guichet dans l'événement (`numeroPlage`), 4001–9999 pour l'app.
- **Code de retrait** : 6 chiffres, jamais en clair en base. Haché SHA-256 (`poivre:sel:code`, poivre dérivé de
  `config.poivre`) pour la vérification, plus une copie chiffrée AES-GCM (`ChiffrementService`, liée au colis)
  pour le montrer ou le renvoyer à l'expéditeur. Seul le destinataire le reçoit par SMS ; aucune réponse
  partenaire, aucun journal d'audit ni d'événements ne le porte (testé).
- **Trois essais** puis blocage (423), même avec le bon code ensuite ; un superviseur débloque. Les essais sont
  comptés par écriture conditionnelle sur `version` (pas de perte en cas de requêtes simultanées).
- **Remise** : code + pièce vérifiée + photo obligatoires.
- **Garde** : 7 jours après la mise à disposition, puis « non retiré » (tâche de fond), SMS à l'expéditeur et
  au destinataire.
- **Photos** : supprimées 90 jours après la prise de vue (tâche de fond : fichier d'abord, puis la trace).
- **Complément de poids** : dû seulement si le poids relevé dépasse le poids déclaré de plus de 1 kg.
- **Assurance** : 2 % (minimum 500 F, valeur plafonnée à 500 000 F), souscrite chez l'assureur partenaire ; si
  l'assureur ne répond pas, le colis garde `assurance.enAttente` et la tâche de fond réessaie.
- **Réclamation** : réponse promise sous 2 jours ouvrés (samedi et dimanche exclus). Perte prouvée par le suivi
  (colis déclaré perdu) : valeur assurée, sinon 10 fois le port. Autre cas : geste commercial au montant donné par
  la personne qui décide, plafonné de la même façon. Le sinistre n'est déclaré à l'assureur que pour une perte
  prouvée ou un colis abîmé assuré.
- **Événements de l'agence** : idempotents par UUID (`accepte` puis `deja_recu`), journalisés en dernier.
- **Tâches de fond** (`TachesColis`, toutes les 15 minutes hors tests) : `purgerPhotos`, `marquerNonRetires`,
  `rejouerAssurances`, `renvoyerCodes`.

## Tables PostgreSQL

Les tables sont créées : `colis`, `photo_colis`, `reclamation_colis` (migrations « modules_metier »,
« modules_metier_garanties » et « colis_caisse_supervision_garanties »). Les colonnes du schéma Prisma sont
en camelCase (`codeEssais`, `gareOrigineId`…) ; le tableau ci-dessous garde la description d'origine, en
snake_case, comme référence de leur sens. Garanties : le numéro est unique, l'écriture d'un colis est un
`UPDATE … WHERE id AND version` (perdant : relit et recommence), et la base refuse un colis à trois essais
sans blocage ou à plus de trois essais.

Les montants sont des entiers en FCFA. Les instants sont des `timestamptz`. Les téléphones et le contenu sont
chiffrés par `ChiffrementService` comme dans le reste de l'API.

**`colis`** (une ligne par colis ; `version` sert à la concurrence optimiste)

| Colonne                                                                                        | Type               | Remarque                                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| `id`                                                                                           | uuid, clé primaire | généré sur l'appareil au guichet                                           |
| `version`                                                                                      | int                | +1 à chaque écriture ; `remplacer(colis, version)` échoue si elle a changé |
| `numero`                                                                                       | text, unique       | `C-GARE-AAMMJJ-NNNN`                                                       |
| `sequence`, `jour`                                                                             | int, text          | numéro dans la plage ; AAMMJJ                                              |
| `canal`, `mode`                                                                                | text               | `agence` ou `app` ; `gare`, `relais`, `moto`                               |
| `compagnie_id`, `depart_id`                                                                    | uuid / text        | `depart_id` est un texte dans les fixtures                                 |
| `gare_origine_id`, `gare_destination_id`                                                       | uuid               |                                                                            |
| `heure_depart`, `arrivee_prevue`                                                               | timestamptz        |                                                                            |
| `expediteur_id`                                                                                | uuid, null         | null pour un colis du guichet                                              |
| `expediteur_nom`, `expediteur_telephone`                                                       | text               | téléphone chiffré                                                          |
| `destinataire_nom`, `destinataire_surnom`, `destinataire_telephone`                            | text               | téléphone chiffré                                                          |
| `contenu`, `poids_kg`                                                                          | text, numeric      |                                                                            |
| `valeur_declaree`, `valeur_assuree`, `assure`                                                  | int, int, bool     |                                                                            |
| `police_assurance`, `assurance_en_attente`                                                     | text, bool         |                                                                            |
| `relais_id`, `adresse_livraison`                                                               | uuid, text         |                                                                            |
| `port`, `prix_total`, `complement_poids`                                                       | int                | `port` sert à l'indemnisation (10 × le port)                               |
| `devis`                                                                                        | jsonb              | lignes `{ code, libelle, montant }`                                        |
| `paiement_reference`, `paiement_moyen`, `paiement_etat`, `paiement_montant`, `paiement_numero` | text/int           | `paye` ou `en_attente`                                                     |
| `code_retrait_hache`, `code_retrait_sel`                                                       | text               | SHA-256 hexadécimal (64) et sel hexadécimal (32)                           |
| `code_retrait_chiffre`                                                                         | text               | AES-GCM, préfixe `enc:v1:` ; **colonne en plus** du haché                  |
| `code_essais`, `code_bloque`                                                                   | int, bool          | essais faux depuis le dernier déblocage                                    |
| `code_envoye_a`, `code_sms`                                                                    | timestamptz, text  | `envoye` ou `au_retour_du_reseau`                                          |
| `cree_a`, `disponible_depuis`                                                                  | timestamptz        | `disponible_depuis` démarre les 7 jours                                    |
| `depose_a`, `depose_poids_kg`, `depose_photo_ref`, `depose_par`                                |                    | dépôt ou enregistrement au guichet                                         |
| `remise_a`, `remise_par`, `remise_photo_ref`                                                   |                    |                                                                            |
| `etat`                                                                                         | text               | un des 13 états                                                            |
| `historique`                                                                                   | jsonb              | `{ action, de, vers, at, par?, motif? }[]`                                 |
| `evenement_ids`                                                                                | uuid[]             | événements du guichet déjà appliqués                                       |

Index : `numero` (unique), `(depart_id, etat)`, `(etat, disponible_depuis)` pour la tâche « non retiré »,
`(expediteur_id)`, `(destinataire_telephone_recherche)` si le destinataire doit retrouver ses colis, et un index
partiel sur `assurance_en_attente` et `code_sms = 'au_retour_du_reseau'`.
`ajouter` doit renvoyer `numero_pris` ou `id_existe` selon la contrainte violée.

**`photo_colis`** : `ref` (clé primaire), `colis_id` (null jusqu'à la création), `genre` (`envoi`, `depot`,
`remise`), `prise_a`, `expire_a` (= prise + 90 jours), `supprimee_a`. Index sur `expire_a` où `supprimee_a` est
null. Une référence de photo n'appartient qu'à un colis (la première liaison l'emporte).

**`reclamation_colis`** : `reference` (clé primaire, `R-AAMMJJ-XXXXXX`), `colis_id`, `colis_numero`,
`compagnie_id`, `auteur_id`, `motif`, `message`, `ouverte_a`, `reponse_avant`, `statut` (`ouverte`, `acceptee`,
`refusee`), `decision` (jsonb : `a`, `par`, `motif`, `indemnisation { type, montant, dossierAssureur }`).
`remplacer(reclamation, statutAttendu)` doit être une mise à jour conditionnelle sur le statut.

**Compteur des colis en ligne** : pas de table `compteur_colis_en_ligne`. Le registre `numero_vu` de la
numérotation (genre `colis`) donne le plus petit numéro libre de la plage 4001–9999 pour la gare et le
jour ; `prochainEnLigne` est idempotent par référence (`NumerotationColisServeur`). Au guichet, le numéro
vient de l'appareil.

Autres ports sans table : `FichiersPhotos` (stockage objet), `AnalysePhotoColis` (estimation du poids et de la
taille), `PaiementsColis` (opérateurs mobiles, clé d'idempotence), `AssureurPartenaire`, `ReferentielColis`
(départs, gares, guichets, points relais, option inter-agences : lecture des modules billetterie et agences).

## Décisions à confirmer

- La copie chiffrée du code (en plus du haché) : nécessaire pour l'afficher à l'expéditeur et le renvoyer.
- Un colis du guichet n'a pas d'expéditeur voyageur : il n'apparaît dans aucun compte voyageur.
- Au guichet, le montant encaissé doit être exactement le prix du colis (`PAIEMENT_INVALIDE`).
- Le montant du complément de poids est celui de l'événement `colis.depose` (le contrat ne donne pas de tarif).
- Le prix de la livraison moto est fixé à 1 000 F à la création ; ajustable seulement par le changement de mode.
- Les identifiants de colis des événements doivent être des UUID (le contrat accepte n'importe quel texte).
- Pas de clé d'idempotence sur `POST /colis` ; le paiement est pris avant l'insertion (échec → audit
  `colis.creation_echouee_apres_paiement`).
- Un voyageur ne peut renvoyer le code qu'une fois par minute.

## Reste à faire

- Stockage de fichiers, référentiel PostgreSQL (départs, gares, guichets), opérateurs de paiement, assureur, analyse de photo réels.
- Passerelle WebSocket du suivi en direct (`DiffusionSuivi` est prête ; `suivreEnDirect` contrôle l'accès).
- Routes des points relais et des livreurs (AM-148) : elles appellent `ColisService.executer` avec leur rôle.
- Inter-agences (`SchemaColisPartenaire` est déjà la vue partagée).
