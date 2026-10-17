# Livraison moto (AM-148)

Module Nest `LivraisonModule` : inscription et vérification des livreurs (badge `L-BAF-0087`), missions
proposées une à une selon la zone, les heures et la charge (30 secondes pour accepter), remise contre le code
du client, destinataire absent (10 minutes d'attente, puis dépôt au point relais), suivi en direct et lien de
suivi partageable, gains (70 % du prix de la livraison) versés le soir ou retirés à la demande.

Le module est autonome : tous ses accès extérieurs sont des **ports** (classes abstraites, `ports.ts`) avec une
version **en mémoire** (`memoire.ts`). Il n'est **pas** dans `AppModule` et n'a **pas** d'adaptateur PostgreSQL :
l'intégration est faite par le coordinateur (voir « Brancher le module »). Tout changement d'état d'un colis
(prise en charge, remise, dépôt au relais de repli) passe par `ColisService.executer` (module colis, AM-163).

Il s'appuie sur `RelaisModule` (`../relais/README.md`) pour le portefeuille, les versements mobiles, les
rôles, les lieux, la numérotation des dossiers et le relais de repli.

## Brancher le module

À faire par le coordinateur (le brief interdit de toucher `app.module.ts` et `prisma/schema.prisma`) :

1. Ajouter `RelaisModule` puis `LivraisonModule` aux `imports` de `AppModule`.
2. Écrire les adaptateurs PostgreSQL des ports (voir « Tables PostgreSQL ») et les fournir à la place des
   versions en mémoire : `LivreursRepository`, `DemandesLivreurRepository`, `MissionsRepository`,
   `PartagesSuivi`, `Invitations`, ainsi que ceux du relais (`Portefeuille`, `CompteursDossiers`…).
3. Brancher les ports communs avec le relais : `Lieux` (géocodeur : sans lui la distance est de 3 km par
   défaut), `VersementsMobile` (opérateur MoMo et Orange Money, AM-165), `AttributionRoles` (`personne.roles`).
4. Brancher la diffusion en direct (`DiffusionLivraison`) sur les passerelles WebSocket, qui restent à écrire :
   - `/livreurs/moi/missions/direct` : s'abonner avec `LivreursService.suivreMissions` (messages
     `SchemaMessageMissions`) ;
   - `/colis/:colisId/livraison/direct` : s'abonner avec `LivraisonService.suivreEnDirect` (position du
     livreur : minutes restantes, arrivée estimée).
5. Les tâches de fond (`TachesLivraison`) démarrent seules hors tests : missions toutes les 5 secondes (propositions
   expirées, nouvelles missions, attentes d'absence, positions diffusées), versements des livreurs chaque
   minute (le soir, à partir de 20 h). Sur plusieurs instances, plusieurs tâches tournent : les écritures
   conditionnelles sur `version` et les clés d'idempotence les rendent sans danger, mais un verrou
   (`pg_advisory_lock`) évitera du travail en double et des SMS en double.

En production, `VerificationPortsLivraison` **refuse de démarrer** tant qu'un port est en mémoire
(`durable === false`) et nomme les ports concernés. `VerificationPortsRelais` fait de même pour le relais.

## Routes

Les noms d'opérations et les schémas sont ceux de `@afrimove/contrats` (`colis`, fichiers `livraison.ts` et
`inscriptions.ts`) et de `@afrimove/api-client` (`colis/operations.ts`). Les réponses sont validées avec les
schémas zod dans les tests e2e.

| Route                                                | Rôle     | Opération                       |
| ---------------------------------------------------- | -------- | ------------------------------- |
| `GET /colis/:colisId/livraison`                      | voyageur | `colis.livraison`               |
| `POST /colis/:colisId/livraison/partage`             | voyageur | `colis.livraison.partager`      |
| `PUT /colis/:colisId/livraison/adresse`              | voyageur | `colis.livraison.adresse`       |
| `GET /livreurs/moi`                                  | livreur  | `livreur.espace`                |
| `PUT /livreurs/moi/disponibilite`                    | livreur  | `livreur.disponibilite`         |
| `POST /livreurs/moi/missions/:missionId/acceptation` | livreur  | `livreur.accepter`              |
| `POST /livreurs/moi/missions/:missionId/refus`       | livreur  | `livreur.passer`                |
| `POST /livreurs/moi/missions/:missionId/remise`      | livreur  | `livreur.remettre`              |
| `POST /livreurs/moi/missions/:missionId/absence`     | livreur  | `livreur.absence`               |
| `POST /livreurs/moi/retraits`                        | livreur  | `livreur.retirer-gains`         |
| `POST /livreurs/moi/invitations`                     | livreur  | `livreur.inviter`               |
| `GET /partenaires/livreurs/programme`                | voyageur | `partenaires.livreur.programme` |
| `POST /partenaires/livreurs/demandes`                | voyageur | `partenaires.livreur.envoyer`   |
| `GET /partenaires/livreurs/demandes/moi`             | voyageur | `partenaires.livreur.suivi`     |

Canaux temps réel du contrat (`colis.livraison.position`, `livreur.missions`) : pas de route HTTP ; voir
« Brancher le module », point 4.

Routes **ajoutées**, absentes des contrats (à confirmer ou à déplacer dans les contrats) :

| Route                                                       | Rôle     | Usage                                                                                                                                |
| ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /suivi/:jeton`                                         | public   | page de suivi du lien partagé : numéro du colis, statut, minutes restantes, initiales du livreur ; sans code ni téléphone ni adresse |
| `GET /livreurs/moi/missions/en-cours`                       | livreur  | reprendre la mission acceptée (le contrat `espace.mission` ne montre que la proposée)                                                |
| `POST /partenaires/livreurs/demandes/:dossier/verification` | afrimove | l'agent coche CNI et MoMo, pièces (avec dates de fin), formation                                                                     |
| `POST /partenaires/livreurs/demandes/:dossier/activation`   | afrimove | crée le livreur (le dossier devient le badge), rôle `livreur`, SMS                                                                   |
| `POST /partenaires/livreurs/demandes/:dossier/refus`        | afrimove | refus avec motif ; SMS                                                                                                               |

Corps d'erreur : `{ code, message, details? }` (celui du module colis). Codes ajoutés : `mission_introuvable`
(404, y compris une mission qui n'est pas celle du livreur), `mission_expiree` (410), `mission_deja_traitee`,
`mission_annulee`, `mission_non_acceptee`, `aucun_relais_de_repli` (409), `livreur_introuvable` (404),
`livreur_suspendu` (403), `pas_en_livraison` et `adresse_non_modifiable` (409), `lien_introuvable` (404),
`partages_epuises` et `invitations_epuisees` (429), `montant_invalide` (422), `solde_insuffisant` (409),
`versement_refuse` (502), `envoi_impossible` (503), `demande_invalide`, `piece_expiree` et `moto_requise`
(422), `deja_livreur`, `livreur_existant`, `demande_en_cours`, `verifications_incompletes`,
`etat_incompatible` (409), `demande_introuvable` (404).

## Règles appliquées

- **Qui reçoit une mission** : livreur actif et disponible, ville et quartier de la zone (« Bafoussam · Tamdja,
  Djeleng, centre » ou « toute la ville »), dans ses heures (heure de Douala), charge maximale suffisante pour
  le poids du colis, et, pour une moto, permis **et** assurance encore valables (dates relevées par l'agent).
  Ordre : le moins de livraisons aujourd'hui, puis la meilleure note, puis le badge le plus ancien.
- **Proposition** : une seule à la fois par mission, **30 secondes** pour accepter (`expireA`). Un refus ou une
  expiration passe au livreur suivant ; **3 tours** de propositions avec **120 s** de pause entre les tours ; après
  trois tours complets, ou après **60 min** si personne ne convient du tout (nuit, hors zone), la mission passe
  à `sans_livreur` et le destinataire reçoit un SMS (le colis l'attend à la gare). Un livreur à qui on a déjà
  proposé le colis au tour courant n'est pas relancé ; un livreur déjà sur une mission n'en reçoit pas une autre.
- **Concurrence** : toute écriture d'une mission est une comparaison et un remplacement sur `version`
  (`remplacer(mission, versionAttendue)`, jusqu'à 10 essais). Deux livreurs qui acceptent en même temps : un
  seul gagne, l'autre reçoit `mission_deja_traitee`. Un colis n'a qu'une mission ouverte à la fois.
- **Appartenance** : une mission qui n'est pas proposée ou acceptée par ce livreur est introuvable (404) pour
  lui, même si elle existe ; `ColisService.executer` ne vérifie pas cela, `MissionsService` le fait.
- **Remise** : code à 6 chiffres, pièce vue et photo obligatoires, vérifiés par `ColisService.executer`
  (trois essais, blocage). Le livreur ne voit jamais le code.
- **Gain** : 70 % du prix de la livraison, arrondi à l'inférieur (700 F sur 1 000 F), crédité une seule fois
  (clé `mission:<missionId>`), y compris sur un dépôt au relais de repli.
- **Destinataire absent** : le livreur signale son arrivée, attend **10 minutes**, puis dépose le colis au
  relais de repli (le plus proche du destinataire, dans sa ville, actif, pas plein, taille suffisante). Si aucun :
  `aucun_relais_de_repli`.
- **Versement du soir** : chaque jour à partir de 20 h (heure de Douala), solde entier (sans minimum), clé
  `versement:livreur:<id>:<AAMMJJ>`. **Retrait à la demande** à partir de **5 000 F** (`solde_insuffisant`
  en dessous) ; le montant est réservé avant l'appel à l'opérateur, annulé si l'opérateur refuse
  (`versement_refuse`), rejoué par la tâche de fond si le résultat est inconnu.
- **Invitations** : un livreur invite au plus **5** personnes par jour ; le SMS part au numéro indiqué.
- **Lien de suivi** : valable **24 h**, au plus **5** par colis. Le jeton est aléatoire ; seul son hachage
  SHA-256 est gardé. La page publique ne renvoie ni code de retrait, ni téléphone, ni adresse complète.
- **Changement d'adresse** : accepté tant que le colis n'est pas remis ; une mission en cours est mise à jour
  et le livreur prévenu.
- **Validation** : `validation.ts` relit les corps à la main (l'API n'importe pas zod à l'exécution) et
  `validation.test.ts` les compare aux schémas des contrats ; les dates des pièces sont de vraies dates.

## Tables PostgreSQL

À créer par le coordinateur dans `prisma/schema.prisma`. Le portefeuille (`credit_partenaire`,
`debit_partenaire`) et `compteur_dossier` sont décrits dans `../relais/README.md` et partagés (`type =
'livreur'`, préfixe `L-BAF`). Les numéros MoMo et les téléphones sont **chiffrés** (`ChiffrementService`).

**`livreur`** (`LivreurStocke`) : `id` (uuid), `version` (int, concurrence optimiste), `badge` (unique,
`L-BAF-0087`), `numero` (int), `personne_id` (unique), `nom`, `ville`, `deplacement` (`moto`, `velo`, `pied`,
`tricycle`), `zone`, `heures`, `charge_max`, `momo_telephone` (chiffré), `momo_operateur`, `permis_ref`,
`assurance_ref`, `permis_valide_jusqua` (date, nulle), `assurance_expire_le` (date, nulle), `moto` (nulle),
`disponible` (bool), `actif` (bool), `note` (numeric), `cree_a`. Index `(actif, disponible, ville)`.

**`demande_livreur`** (`DemandeLivreur`) : `dossier` (clé), `version`, `personne_id`, `numero`, `ville`,
`deplacement`, `zone`, `heures`, `charge_max`, `momo_*` (chiffré), `permis_ref`, `assurance_ref`, `deposee_a`,
`verif_identite_a`, `verif_pieces_a`, `permis_valide_jusqua`, `assurance_expire_le`, `verif_formation_a`
(tous nuls tant que non faits), `etat` (`recue`, `activee`, `refusee`), `decision` (jsonb nul), `livreur_id`
(nul). **Index unique partiel** sur `personne_id WHERE etat = 'recue'` (une demande ouverte par personne) ; la
clé primaire donne `dossier_pris`.

**`mission_livraison`** (`MissionLivraison`) : `id`, `version`, `colis_id`, `colis_numero`, `etat`
(`en_attente`, `proposee`, `acceptee`, `livree`, `repli`, `sans_livreur`, `annulee`), `livreur_id` (nul),
`proposee_a`, `expire_a`, `essais` (jsonb : livreur, issue, instant, tour), `tour`, `prochaine_a`, `cree_a`,
`acceptee_a`, `livree_a`, `trajet` (jsonb : départ, arrivée, destinataire), `distance_m`, `duree_minutes`,
`prix_livraison`, `gain`, `absence` (jsonb nul : début, jusqu'à, relais), `repli_a`.
**Index unique partiel** sur `colis_id WHERE etat IN ('en_attente','proposee','acceptee','sans_livreur')` :
une seule mission ouverte par colis (`ajouter` renvoie `colis_deja_servi`). `remplacer` =
`UPDATE … WHERE id = $1 AND version = $2`, vrai si une ligne a changé. Index `(etat, expire_a)` pour la tâche de
fond et `(livreur_id, etat)` pour l'espace du livreur.

**`partage_suivi`** : `jeton_hache` (clé, SHA-256 du jeton ; le jeton n'est jamais gardé), `colis_id`,
`cree_a`, `expire_a`. Index `(colis_id)` pour compter les partages.

**`invitation_livreur`** : `livreur_id`, `at`. Index `(livreur_id, at)` pour compter depuis minuit (Douala).

## Décisions à confirmer

- Le livreur est crédité des **700 F entiers sur un dépôt au relais de repli** (destinataire absent), comme sur
  une livraison réussie.
- Le **versement du soir** prend tout le solde sans minimum ; le seuil de 5 000 F ne vaut que pour un retrait
  manuel. À confirmer : un solde de quelques centaines de francs doit-il être versé chaque soir ?
- Un livreur est créé **hors ligne** (`disponible = false`) : il se met en ligne lui-même.
- Un **retrait** utilise une clé d'idempotence aléatoire : une requête répétée par le client avant la réponse
  pourrait créer un second retrait, limité par la réserve atomique sur le solde. Une clé fournie par le client
  (en-tête `Idempotency-Key`) serait plus sûre.
- Route ajoutée `GET /livreurs/moi/missions/en-cours` : le contrat ne permet pas de reprendre une mission
  acceptée après un redémarrage de l'app.
- Le **suivi public** `GET /suivi/:jeton` et la base du lien `https://afrimove.app/suivi/` sont inventés ;
  les routes des agents (vérification, activation, refus) ne sont pas dans les contrats.
- **Qui change l'adresse** : l'expéditeur comme le destinataire (tout voyageur du colis).
- Sans coordonnées (`Lieux` inconnu), la distance est de 3 km et la durée de 10 minutes (300 m par minute).
- Une pièce vaut jusqu'à minuit de son dernier jour (heure de Douala) ; un livreur à moto sans date de
  permis ou d'assurance ne reçoit rien.
- Textes inventés (SMS, libellés, statuts de suivi) : voir `contenu.ts` et les SMS des services.

## Reste à faire

- Adaptateurs PostgreSQL des ports ci-dessus, tables et migrations Prisma (coordinateur).
- `Lieux`, `VersementsMobile` (AM-165), `AttributionRoles` (communs avec le relais).
- Passerelles WebSocket `/livreurs/moi/missions/direct` et `/colis/:colisId/livraison/direct`.
- Positions GPS du livreur : aucune route d'envoi n'existe dans les contrats ; `diffuserPositions` diffuse
  aujourd'hui une estimation fondée sur la durée de la mission.
- Verrou d'instance pour les tâches de fond si l'API tourne sur plusieurs processus.
- Notes des livreurs : la note vaut 5 à la création et n'est modifiée par aucune route.
