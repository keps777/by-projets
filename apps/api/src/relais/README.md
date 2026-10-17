# Points relais (AM-148)

Module Nest `RelaisModule` : recherche des relais proches et choix par l'expéditeur, inscription d'une boutique
et vérification par un agent AfriMove (dossier `R-BAF-0215`), réception et remise des colis contre code et
pièce, garde de 7 jours puis reprise, gains (200 F par colis remis, 100 F par colis repris) versés le lundi.

Le module est autonome : tous ses accès extérieurs sont des **ports** (classes abstraites, `ports.ts`) avec une
version **en mémoire** (`memoire.ts`). Il n'est **pas** dans `AppModule` et n'a **pas** d'adaptateur PostgreSQL :
l'intégration est faite par le coordinateur (voir « Brancher le module »). Tout changement d'état d'un colis
passe par `ColisService.executer` (module colis, AM-163) : la machine d'états n'est pas dupliquée.

Le module `LivraisonModule` (livraison moto, `../livraison/README.md`) s'appuie sur celui-ci : portefeuille,
versements mobiles, attribution de rôles et lieux sont définis ici.

## Brancher le module

À faire par le coordinateur (le brief interdit de toucher `app.module.ts` et `prisma/schema.prisma`) :

1. Ajouter `RelaisModule` (puis `LivraisonModule`) aux `imports` de `AppModule`.
2. Brancher le référentiel du colis : `ReferentielColis.relais = RelaisService.reference` (le module colis y
   vérifie qu'un relais existe et est actif quand l'expéditeur ou le guichet en choisit un).
3. Écrire les adaptateurs PostgreSQL des ports (voir « Tables PostgreSQL ») et les fournir à la place des
   versions en mémoire : `RelaisRepository`, `DemandesRelaisRepository`, `BrouillonsRelais`, `CompteursDossiers`,
   `ReceptionsRelais`, `Portefeuille`. Les numéros MoMo et les téléphones sont chiffrés par `ChiffrementService`.
4. Brancher les ports sans table :
   - `Lieux` (géocodeur et coordonnées des gares) : sans lui les distances sont inconnues ;
   - `VersementsMobile` (envoi d'argent MoMo et Orange Money, AM-165), idempotent par clé ;
   - `AttributionRoles` : ajoute le rôle `relais` ou `livreur` à `personne.roles` (le socle n'a pas d'opération
     de changement de rôles).
5. Les tâches de fond (`TachesRelais`) démarrent seules hors tests : rappel et reprise des colis toutes les
   minutes, versement du lundi chaque minute (clé d'idempotence par relais et par semaine). Sur plusieurs
   instances, plusieurs tâches tournent ; les écritures conditionnelles et les clés rendent cela sans danger,
   mais un verrou (`pg_advisory_lock`) évitera du travail en double.

En production, `VerificationPortsRelais` **refuse de démarrer** tant qu'un port est en mémoire ou simulé
(`durable === false`) et nomme les ports concernés.

## Routes

Les noms d'opérations et les schémas sont ceux de `@afrimove/contrats` (`colis`, fichiers `relais.ts`,
`inscriptions.ts`) et de `@afrimove/api-client` (`colis/operations.ts`). Les réponses sont validées avec les
schémas zod dans les tests e2e.

| Route                                  | Rôle     | Opération                       |
| -------------------------------------- | -------- | ------------------------------- |
| `GET /colis/:colisId/relais`           | voyageur | `colis.relais-proches`          |
| `PUT /colis/:colisId/relais`           | voyageur | `colis.choisir-relais`          |
| `GET /relais/moi`                      | relais   | `relais.espace`                 |
| `GET /relais/moi/colis/:colisId`       | relais   | `relais.colis`                  |
| `POST /relais/moi/receptions`          | relais   | `relais.recevoir`               |
| `POST /relais/moi/remises`             | relais   | `relais.remettre`               |
| `GET /partenaires/relais/programme`    | voyageur | `partenaires.relais.programme`  |
| `GET /partenaires/relais/formulaire`   | voyageur | `partenaires.relais.formulaire` |
| `PUT /partenaires/relais/brouillon`    | voyageur | `partenaires.relais.brouillon`  |
| `POST /partenaires/relais/demandes`    | voyageur | `partenaires.relais.envoyer`    |
| `GET /partenaires/relais/demandes/moi` | voyageur | `partenaires.relais.suivi`      |

Routes **ajoutées**, absentes des contrats (à confirmer ou à déplacer dans les contrats) :

| Route                                                   | Rôle     | Usage                                                          |
| ------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| `POST /partenaires/relais/demandes/:dossier/visite`     | afrimove | l'agent planifie la visite (agent, créneau) ; SMS au demandeur |
| `POST /partenaires/relais/demandes/:dossier/activation` | afrimove | l'agent active : crée le relais, donne le rôle `relais`, SMS   |
| `POST /partenaires/relais/demandes/:dossier/refus`      | afrimove | l'agent refuse avec un motif ; SMS                             |

Corps d'erreur : `{ code, message, details? }` (celui du module colis). Codes ajoutés : `autre_relais` (403, le
colis n'est pas chez ce relais), `relais_introuvable` (404), `relais_suspendu` (403), `relais_hors_ville` et
`colis_trop_lourd` (422), `relais_complet` (409, relais choisi plein), `capacite_atteinte` (409, réception
refusée car le relais est plein), `etat_incompatible` (409), `fiche_invalide` (422), `demande_en_cours` (409),
`demande_introuvable` (404), `deja_relais` et `relais_existant` (409).

## Règles appliquées

- **Gains** : 200 F par colis remis (`remise:<colisId>`), 100 F par colis repris (`reprise:<colisId>`, crédité
  par la tâche de fond quand l'agence a retourné un colis resté 7 jours chez le relais). La clé d'idempotence du
  crédit fait qu'un rejeu (requête répétée, tâche relancée) ne compte jamais deux fois. Un échec du crédit ne
  défait pas la remise : il est journalisé (`relais.gain_non_credite`) pour être rattrapé à la main.
- **Versement** : chaque lundi à partir de 8 h (heure de Douala, +01:00) pour le solde du relais ; clé
  `versement:relais:<id>:<AAMMJJ du lundi>`. Le débit « en attente » est réservé avant l'appel à l'opérateur ;
  si l'opérateur refuse pour de bon (`VersementRefuse`), le débit est annulé et le solde revient ; si le
  résultat est inconnu (réseau, délai), le débit reste en attente et la tâche rejoue avec la même clé.
- **Garde** : 7 jours après la réception, le colis passe à `non_retire` (tâche de fond, action
  `marquer_non_retire`) puis l'agence le reprend ; **rappel** au destinataire à partir du 5e jour (une seule
  fois : `marquerRappel` est atomique).
- **Remise** : code à 6 chiffres + pièce vérifiée + photo, via `ColisService.executer`. Les trois essais et le
  blocage sont ceux du module colis. Le relais ne voit jamais le code (il ne figure dans aucune de ses réponses).
- **Appartenance** : un relais ne peut ni recevoir ni remettre un colis qui n'est pas chez lui (403
  `autre_relais`) ; `ColisService.executer` ne vérifie pas cela, `RelaisService` le fait.
- **Capacité** : 30 colis par défaut, gardés ou attendus ; un relais plein refuse le choix (`relais_complet`) et
  la réception (`capacite_atteinte`). Un colis plus lourd que la taille maximale du relais est refusé.
- **Recherche des relais proches** : relais actifs de la ville du destinataire, du plus proche au plus éloigné
  quand `Lieux` connaît les coordonnées ; sans coordonnées, par note décroissante puis par nom. Seul
  l'expéditeur choisit le relais.
- **Inscription** : une seule demande ouverte par personne (`recue` ou `visite_planifiee`, contrainte
  d'unicité) ; numéro de dossier `R-<VILLE>-NNNN` par un compteur atomique, sans trou ni doublon ; brouillon
  enregistré à chaque étape ; l'agent passe sous 72 h. Les champs inconnus du corps ne sont jamais recopiés.
- **Validation** : l'API ne peut pas importer zod à l'exécution ; `validation.ts` relit les corps à la main et
  `validation.test.ts` les compare aux schémas des contrats sur des cas valides et invalides.
- **Temps** : toutes les heures affichées et les bornes (lundi 8 h, jours de garde) sont celles de Douala.

## Tables PostgreSQL

À créer par le coordinateur dans `prisma/schema.prisma`, avec les index et contraintes ci-dessous (ce sont eux
qui garantissent les propriétés que les ports en mémoire simulent).

**`relais`** (`PointRelaisStocke`)

| Colonne                                               | Type         | Remarque                                                |
| ----------------------------------------------------- | ------------ | ------------------------------------------------------- |
| `id`                                                  | uuid, clé    |                                                         |
| `version`                                             | int          | concurrence optimiste : `UPDATE … WHERE id AND version` |
| `code`                                                | text, unique | `R-BAF-0215` (le numéro du dossier)                     |
| `personne_id`                                         | uuid, unique | un compte voyageur ne devient relais qu'une fois        |
| `nom`, `type_boutique`, `ville`, `quartier`, `repere` | text         | `repere` nul possible                                   |
| `latitude`, `longitude`                               | double, nuls | relevées par l'agent ; nulles tant qu'inconnues         |
| `ouvert`, `taille_max`, `particularite`               | text         | `particularite` nulle possible                          |
| `capacite`                                            | int          | 30 par défaut                                           |
| `momo_telephone`, `momo_operateur`                    | text         | téléphone **chiffré** (`ChiffrementService`)            |
| `facade_ref`                                          | text         | référence de la photo                                   |
| `actif`                                               | bool         | faux = suspendu                                         |
| `note`                                                | numeric      | 5 au départ                                             |
| `cree_a`, `premier_colis_a`                           | timestamptz  |                                                         |

Index : `(ville, actif)` pour la recherche des relais proches.

**`demande_relais`** (`DemandeRelais`) : `dossier` (clé), `version`, `personne_id`, `fiche` (jsonb, MoMo chiffré),
`etat` (`recue`, `visite_planifiee`, `activee`, `refusee`), `deposee_a`, `visite` (jsonb nul : agent, créneau,
planifiée à), `decision` (jsonb nul : à, par, motif), `relais_id` (nul). **Index unique partiel** sur
`personne_id WHERE etat IN ('recue','visite_planifiee')` : une seule demande ouverte par personne
(`ajouter` renvoie `demande_en_cours`) ; la clé primaire donne `dossier_pris`. Index `(personne_id, deposee_a desc)`
pour `derniereDe`.

**`brouillon_relais`** : `personne_id` (clé), `fiche` (jsonb partiel, MoMo chiffré), `enregistre_a`.

**`compteur_dossier`** : `prefixe` (clé, `R-BAF`, `L-BAF`), `valeur` (int). `prochain` fait
`INSERT … ON CONFLICT (prefixe) DO UPDATE SET valeur = compteur_dossier.valeur + 1 RETURNING valeur`, ce qui est
atomique. Le compteur est partagé avec la livraison (préfixe `L-`).

**`reception_relais`** (`ReceptionRelais`) : `colis_id` (clé, un colis n'a qu'une réception), `relais_id`,
`recu_a`, `rappel_envoye_a` (nul), `remise_ouverte_a` (nul). `marquerRappel` :
`UPDATE … SET rappel_envoye_a = $2 WHERE colis_id = $1 AND rappel_envoye_a IS NULL`, vrai si une ligne a changé.
Index `(relais_id)`.

**Portefeuille** (partagé avec les livreurs)

- **`credit_partenaire`** (`Credit`) : `cle` (clé primaire, l'idempotence), `type` (`relais`, `livreur`),
  `partenaire_id`, `montant` (int, FCFA, > 0), `motif` (`remise`, `reprise`, `livraison`), `reference` (colis ou
  mission), `at`. `crediter` = `INSERT … ON CONFLICT (cle) DO NOTHING`, vrai si une ligne a été insérée.
- **`debit_partenaire`** (`Debit`) : `cle` (clé primaire), `type`, `partenaire_id`, `montant`, `motif`
  (`versement`, `retrait`), `at`, `etat` (`en_attente`, `verse`), `operateur`, `telephone` (**chiffré**),
  `libelle`, `reference` (nulle jusqu'au versement).
- **Solde** = somme des crédits moins somme des débits (en attente ou versés), par `(type, partenaire_id)`.
- **`reserver` doit être atomique** : une transaction qui verrouille le partenaire (`pg_advisory_xact_lock`
  sur `(type, partenaire_id)` ou `SELECT … FOR UPDATE` sur une ligne de solde), recalcule le solde, répond
  `solde_insuffisant` s'il est inférieur à `max(montant, soldeMinimum)`, `existe` si la clé est déjà là, sinon
  insère le débit en attente. Sans ce verrou, deux retraits simultanés pourraient dépenser deux fois le même solde.
- `annuler(cle)` supprime le débit en attente ; `confirmer(cle, reference)` le passe à `verse`.

## Décisions à confirmer

- Le **versement du lundi** prend tout le solde, y compris les gains du lundi gagnés après l'heure du
  versement : ils attendent le lundi suivant. Pas de minimum de versement pour un relais.
- Un relais **ne remet pas** un colis à l'état `non_retire` (garde de 7 jours écoulée, en attente de reprise) :
  il reçoit `etat_incompatible`. À confirmer : faut-il laisser le destinataire retirer un colis encore sur place ?
- Un relais **ne peut pas être supprimé** ni son code changé ; seul `actif` (suspension) existe. Aucune route de
  suspension n'est exposée : à demander si besoin.
- Sans coordonnées (`Lieux` inconnu), la recherche des relais proches classe par note puis par nom et
  n'affiche pas de distance.
- Le relais qui **reprend** un colis non retiré reçoit 100 F ; AfriMove n'en garde pas.
- Les routes de l'agent (`visite`, `activation`, `refus`) ne sont pas dans les contrats ; leurs corps sont
  `{ agent, creneau }`, `{ position?: { lat, lon }, particularite?, capacite? }` et `{ motif }`.
- Textes SMS et libellés inventés (non fournis par les maquettes) : voir `contenu.ts` et les SMS de
  `inscription.service.ts` et `taches.service.ts`.

## Reste à faire

- Adaptateurs PostgreSQL des ports ci-dessus, tables et migrations Prisma (coordinateur).
- `Lieux` : géocodage des adresses et coordonnées des gares ; `VersementsMobile` : opérateur (AM-165) ;
  `AttributionRoles` : écriture de `personne.roles`.
- Brancher `ReferentielColis.relais` sur `RelaisService.reference`.
- Photos : la façade et la photo de remise sont des références de fichier ; le téléversement est celui du module
  colis (`FichiersPhotos`, encore en mémoire).
- Verrou d'instance pour les tâches de fond si l'API tourne sur plusieurs processus.
- Routes de suspension et de réglage de la capacité d'un relais, si le produit les veut.
