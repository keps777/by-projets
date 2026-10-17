# Covoiturage (AM-054)

Trajets entre villes et en ville, trajets réguliers, réservations, demandes de passagers, vérification des
conducteurs (pièce d'identité, permis, carte grise, voiture), notes, paiement libéré au conducteur à
l'arrivée, 250 F de frais par place, annulation et remboursement.

Le module est **autonome** : `CovoiturageModule` s'appuie sur le module paiements (AM-165) et la passerelle
SMS par leurs ports et services exportés ; **il ne modifie ni les paiements, ni la billetterie, ni
`app.module.ts`, ni le schéma Prisma**. Tout son stockage passe par des ports (classes abstraites) dont
`memoire.ts` donne des versions en mémoire ; les tables PostgreSQL à écrire sont décrites plus bas. En
production, le module **refuse de démarrer** tant qu'un port est en mémoire ou simulé
(`VerificationStockageCovoiturage`).

## Les trois règles du ticket

| Règle                                           | Où elle est tenue                                                                                                                                                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un conducteur non vérifié ne peut pas publier   | `VerificationService.exigerVerifie` (403 `CONDUCTEUR_NON_VERIFIE`, avec `details.aFournir`) en tête de `TrajetsService.publier`. Les quatre pièces doivent être **validées par AfriMove** et en cours de validité (permis). |
| Le paiement n'est libéré qu'à l'arrivée         | Le passager paie : l'argent reste chez l'agrégateur, la réservation est `payee`. Il part seulement par `LiberationService.liberer` : confirmation du passager (après l'heure du départ) ou balayage, arrivée prévue + 2 h.  |
| Les 4 écrans covoiturage avec l'adaptateur HTTP | Les routes ci-dessous ont les chemins de `packages/api-client/src/voyageur/operationsServices.ts` ; `covoiturage.e2e.test.ts` valide chaque réponse avec les schémas zod de `@afrimove/contrats` (`voyageur`).              |

## Le chemin de l'argent

```
passager ── POST /voyageur/covoit/:offreId/reservations ──► ReservationsService.reserver
              retient les places 15 min, rend la Commande (type « covoiturage », lignes places + frais_voyageur)
passager ── POST /voyageur/commandes/:id/paiements ───────► module paiements (inchangé)
              CommandesAPayer.trouver(id) → réservation (voir « Adossement aux paiements »)
              répartition : prix des places → compte de SÉQUESTRE, frais 250 F/place → compte AfriMove
agrégateur ── webhook signé ─► EncaissementsService ─► CommandesAPayer.confirmer ─► ReservationsService.confirmerPaiement
              réservation « payee » ; SMS au conducteur. L'argent n'est PAS versé.
                 │
                 ├─ passager : POST /voyageur/covoit/reservations/:id/arrivee   (après l'heure du départ)
                 └─ ou balayage : arrivée prévue + 2 h (COVOITURAGE_LIBERATION_APRES_MIN)
                       ▼
              LiberationService.liberer : réservation « terminee » (comparer et remplacer), puis
              Versements.creer (un seul par réservation) → PasserelleVersements.verser(cle = covoiturage:<id>)
              échec : versement « a_faire », repris par le balayage (attente doublée, 6 h au plus),
              « echoue » après 8 essais → GET /covoiturage/versements?statut=echoue pour AfriMove
```

Montants : le conducteur reçoit **le prix des places** (`prixParPlace × places`) ; les 250 F par place restent à
AfriMove (même règle que `devisCovoit` du domaine, vérifiée par `parite.test.ts`).

### Annulations

| Qui / quand                                  | Passager                                                 | Conducteur                          |
| -------------------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| Passager, avant le paiement                  | rien n'est dû, la place est rendue                       | rien                                |
| Passager, payé, 2 h ou plus avant le départ  | prix rendu en entier, **frais d'AfriMove gardés**        | rien                                |
| Passager, payé, moins de 2 h avant le départ | la moitié du prix (arrondie en sa faveur) est rendue     | reçoit l'autre moitié tout de suite |
| Passager, après le départ                    | refusé (409 `TRAJET_COMMENCE`) : il confirme son arrivée | payé à l'arrivée                    |
| Conducteur annule le trajet, avant le départ | prix **et frais** rendus, SMS au passager                | rien                                |

Les remboursements passent par `RemboursementsService.demander(…, differe: true)` : le prix revient de la part
« compagnie » (le séquestre), les frais de la part « AfriMove ». Un paiement qui arrive pour une réservation
annulée ou dont les places ont été reprises (`COMMANDE_ANNULEE`, `SIEGES_PERDUS`) est remboursé en entier par
les paiements, sans rien faire de plus ici.

## Adossement aux paiements (sans les modifier)

Le module paiements lit ses commandes par le port `CommandesAPayer`, branché sur la billetterie. Au démarrage,
`AbonnementPaiementsCovoiturage` **enveloppe** l'instance partagée de `CommandesAPayer` (récupérée par
`ModuleRef`, avec un marqueur `Symbol.for` pour ne le faire qu'une fois ; même procédé que
`AbonnementAvisBilletterie` des paiements) : une commande qui est une réservation de covoiturage est lue et
confirmée par `CommandesCovoiturage` / `ReservationsService`, toute autre va à la billetterie comme avant
(non-régression testée avec une commande de bus). `COVOITURAGE_ABONNER_PAIEMENTS=false` le désactive si
l'intégration préfère composer elle-même `CommandesAPayer`.

La commande d'une réservation a pour `compagnieId` la **compagnie de séquestre** (`COVOITURAGE_COMPAGNIE_ID`,
une compagnie fictive qui n'existe pas dans la billetterie) : c'est son compte chez l'agrégateur qui reçoit
le prix des places. Un guichetier ne peut donc ni lire ni encaisser une réservation (autre compagnie).

## Intégration (par le coordinateur)

1. Importer `CovoiturageModule` dans `AppModule`, **avec** `PaiementsModule` (le module les importe déjà ; rien
   d'autre à déclarer). Garder `rawBody: true` (signature des webhooks, voir le README des paiements).
2. **Compte de séquestre** : donner `COVOITURAGE_COMPTE_SEQUESTRE` (identifiant du compte chez l'agrégateur) ; il
   est enregistré au démarrage chez les paiements. `PUT /paiements/comptes-reversement/:compagnieId` ne
   convient **pas** : il exige une compagnie du catalogue de la billetterie, et la compagnie de séquestre n'y
   est pas. Sans ce compte, payer une réservation échoue (422 `COMPAGNIE_SANS_COMPTE`).
3. Remplacer les ports en mémoire par des adaptateurs PostgreSQL (tables ci-dessous) : `Trajets`,
   `Reservations`, `Dossiers`, `Versements`, `Demandes`, `Notes`, `TrajetsReguliersPassagers`.
4. Écrire `PasserelleVersements` : le **décaissement MoMo** de l'agrégateur (`verser({ cle, montant, telephone })`,
   idempotent par `cle`). Le module paiements ne fait que des encaissements et des remboursements ; ce
   décaissement n'existe pas encore. En attendant, l'adaptateur simulé journalise sans envoyer d'argent.
5. Brancher `ReferentielCovoiturage` sur le référentiel des villes et des lignes (nom d'une ville, fourchette de
   prix conseillée, durée). Celui en mémoire ne connaît que quelques villes et Douala ↔ Kribi.
6. Service de fichiers : `PUT …/verification/pieces/:type` reçoit un `fichierId` déjà déposé ailleurs ; l'envoi
   des photos (et leur lecture par AfriMove) reste à brancher sur le service de dépôt.
7. Accueil : `RechercheService.pourListe(voyageurId, { depart, arrivee, jour })` rend les covoiturages du jour
   au format de `covoits` de `GET /voyageur/departs`. Il est exporté ; la billetterie doit l'appeler
   (ce module ne modifie pas la billetterie).
8. Fournisseur d'identité : `AnnuaireComptesCovoiturage` lit nom et téléphone par `PersonnesRepository`.

## Routes

Chemins et schémas du client d'API (`@afrimove/contrats`, `voyageur`), rôle `voyageur`.

| Écran / usage                     | Route                                                                                                                                      | Contrat      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| Covoit : recherche                | `GET /voyageur/covoit?depart&arrivee&apartirDe&filtres&prixMax`                                                                            | oui          |
| Covoit : réserver                 | `POST /voyageur/covoit/:offreId/reservations` `{ places }`                                                                                 | oui          |
| Covoit en ville : offres          | `GET /voyageur/ville/offres?ville&depart&arrivee&quand&types`                                                                              | oui          |
| Covoit en ville : trajet du matin | `GET`, `PUT /voyageur/covoit/ville/trajet-regulier`                                                                                        | oui          |
| Conducteur : formulaire           | `GET /voyageur/covoit/conducteur/formulaire`                                                                                               | oui          |
| Conducteur : publier              | `POST /voyageur/covoit/conducteur/trajets`                                                                                                 | oui          |
| Conducteur : mes trajets          | `GET /voyageur/covoit/conducteur`                                                                                                          | oui          |
| Conducteur : proposer             | `POST /voyageur/covoit/conducteur/demandes/:id/propositions`                                                                               | oui          |
| Mes réservations                  | `GET /voyageur/covoit/reservations[/:id]`                                                                                                  | hors contrat |
| Je suis arrivé                    | `POST /voyageur/covoit/reservations/:id/arrivee`                                                                                           | hors contrat |
| Annuler ma réservation            | `DELETE /voyageur/covoit/reservations/:id`                                                                                                 | hors contrat |
| Noter                             | `POST /voyageur/covoit/reservations/:id/note` (passager), `POST …/conducteur/reservations/:id/note`                                        | hors contrat |
| Mes demandes                      | `GET`, `POST /voyageur/covoit/demandes`, `DELETE …/demandes/:id`                                                                           | hors contrat |
| Créer mon trajet régulier         | `POST /voyageur/covoit/ville/trajet-regulier`                                                                                              | hors contrat |
| Annuler un trajet (conducteur)    | `DELETE /voyageur/covoit/conducteur/trajets/:id[?serie=true]`                                                                              | hors contrat |
| Vérification (conducteur)         | `GET …/conducteur/verification`, `PUT …/verification/vehicule`, `PUT …/verification/pieces/:type`, `PUT …/verification/versement`          | hors contrat |
| Vérification (AfriMove)           | `GET /covoiturage/verifications[/:id]`, `PUT /covoiturage/verifications/:id/pieces/:type`, `GET /covoiturage/versements` (rôle `afrimove`) | hors contrat |

« Hors contrat » : le ticket n'a aucun schéma pour ces routes ; leurs formes sont libres et à confirmer avant
d'écrire les écrans correspondants. Le paiement se fait avec les routes des paiements :
`POST /voyageur/commandes/:id/paiements`.

Erreurs (corps `{ code, message, details? }`) : 403 `CONDUCTEUR_NON_VERIFIE`, 422 `PRIX_INVALIDE`,
`PLACES_AU_DELA_DU_VEHICULE`, `DEPART_TROP_PROCHE`, `DEPART_TROP_LOIN`, 409 `TRAJET_CHEVAUCHANT`,
`PLUS_ASSEZ_DE_PLACES`, `DEJA_RESERVE`, `TRAJET_PROPRE`, `RESERVATION_FERMEE`, `TRAJET_INDISPONIBLE`,
`TRAJET_PAS_COMMENCE`, `TRAJET_COMMENCE`, `RESERVATION_NON_PAYEE`, `PAS_ENCORE_TERMINEE`, `DEJA_NOTE`.

## Sécurité et données personnelles

- Les numéros de pièce (identité, permis, carte grise) et le numéro MoMo du conducteur sont **chiffrés au
  repos** (AES-GCM, contexte `covoiturage.piece:<conducteur>:<type>` et `covoiturage.versement:<conducteur>`) ;
  ils ne sortent jamais d'une vue, d'un journal d'audit ni d'un SMS.
- Les photos des pièces ne passent pas par ce module : seul leur `fichierId` est gardé.
- Chaque décision d'AfriMove sur une pièce, chaque publication, annulation, paiement et versement est écrit
  dans le journal d'audit chaîné.
- Le public ne voit que « Samuel E. » ; la plaque d'immatriculation n'est rendue qu'avec une offre réservable.
- Le texte d'un SMS vient de ce module (type `systeme`), jamais d'une route ; un SMS qui ne part pas ne fait
  jamais échouer l'opération.

## Variables d'environnement (`COVOITURAGE_*`)

| Variable                              | Défaut                                 | Rôle                                                              |
| ------------------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `COVOITURAGE_BALAYAGE_MS`             | `60000` (0 : désactivé)                | période du balayage                                               |
| `COVOITURAGE_LIBERATION_APRES_MIN`    | `120`                                  | délai après l'arrivée prévue avant le versement automatique       |
| `COVOITURAGE_ANNULATION_GRATUITE_MIN` | `120`                                  | annulation gratuite jusqu'à ce délai avant le départ              |
| `COVOITURAGE_RETENUE_TARDIVE_PCT`     | `50`                                   | part du prix gardée par le conducteur en cas d'annulation tardive |
| `COVOITURAGE_FERMETURE_MIN`           | `30`                                   | réservations closes ce délai avant le départ                      |
| `COVOITURAGE_RETENUE_MIN`             | `15`                                   | durée de retenue des places (celle du blocage de siège)           |
| `COVOITURAGE_HORIZON_JOURS`           | `60`                                   | publication et demandes au plus tant de jours à l'avance          |
| `COVOITURAGE_PRIX_MAX_FCFA`           | `20000`                                | prix maximum d'une place quand le référentiel n'a pas de conseil  |
| `COVOITURAGE_COMPAGNIE_ID`            | `00000000-0000-4000-8000-0000000c0707` | compagnie de séquestre vue des paiements                          |
| `COVOITURAGE_COMPTE_SEQUESTRE`        | aucun                                  | compte du séquestre chez l'agrégateur                             |
| `COVOITURAGE_VERSEMENT_ESSAIS_MAX`    | `8`                                    | essais avant qu'un versement passe « échoué »                     |
| `COVOITURAGE_VERSEMENT_REPRISE_MS`    | `60000`                                | attente avant le deuxième essai (doublée à chaque essai)          |
| `COVOITURAGE_ABONNER_PAIEMENTS`       | `true`                                 | branche les réservations sur les paiements au démarrage           |

## Tables PostgreSQL attendues

Montants en FCFA entiers (`integer`), dates en `timestamptz`, identifiants `uuid`. Noms en français, comme
le reste du schéma. Les index uniques et les écritures « comparer et remplacer » sont ce qui rend le module
sûr avec plusieurs instances : les adaptateurs doivent les reproduire.

- **`trajet_covoiturage`** : `id`, `conducteur_id`, `type` (`entre_villes`, `ville`), `depart_ville`,
  `depart_ville_norm`, `depart_point`, `arrivee_ville`, `arrivee_ville_norm`, `arrivee_point`, `depart_a`,
  `duree_minutes`, `places`, `prix_par_place`, `options` (`text[]`), `vehicule`, `immatriculation`,
  `grand_bagage`, `regulier`, `suivant_cree_a` (null tant que la semaine suivante n'est pas publiée),
  `statut` (`publie`, `annule`, `termine`), `cree_a`, `annule_a`. Les colonnes `*_norm` (minuscules, sans
  accents ni espaces en trop, comme `normaliser`) servent la recherche. Index sur
  `(type, depart_ville_norm, arrivee_ville_norm, depart_a) WHERE statut = 'publie'` et
  `(conducteur_id, depart_a)`. `marquerSuivant` = `UPDATE … SET suivant_cree_a = $2 WHERE id = $1 AND
suivant_cree_a IS NULL`.
- **`vue_trajet_covoiturage`** : `(trajet_id, voyageur_id)` unique ; compte les voyageurs qui ont vu un trajet.
- **`reservation_covoiturage`** : `id` (= identifiant de la commande), `trajet_id`, `conducteur_id`,
  `passager_id`, `places`, `prix_par_place`, `frais_par_place`, `libelle`, `statut`
  (`en_attente_paiement`, `expiree`, `payee`, `terminee`, `annulee`), `cree_a`, `expire_a`, `payee_a`,
  `moyen_paiement`, `depart_a`, `liberation_auto_a`, `liberee_a`, `motif_liberation`, `annulee_a`,
  `annule_par`, `remboursement_prix`, `remboursement_frais`, `retenue`. **Index unique partiel**
  `(trajet_id, passager_id) WHERE statut IN ('en_attente_paiement','payee')`. `reserver` et `payer` sont des
  transactions qui verrouillent la ligne du trajet (`SELECT … FOR UPDATE`) avant de compter les places prises
  (réservations `payee` ou `en_attente_paiement` non expirées) : deux réservations simultanées ne dépassent
  jamais les places. `transitionner` = `UPDATE … WHERE id = $1 AND statut = ANY($2)`. Index sur
  `(statut, expire_a)` (expiration) et `(statut, liberation_auto_a)` (libération).
- **`dossier_conducteur`** : `conducteur_id` (clé), véhicule (`marque`, `modele`, `couleur`, `immatriculation`,
  `places`, `grand_bagage`), `numero_versement_chiffre`, `cree_a`, `modifie_a`.
- **`piece_conducteur`** : `(conducteur_id, type)` unique (`identite`, `permis`, `carte_grise`, `voiture`),
  `statut` (`a_verifier`, `validee`, `refusee`), `fichier_id`, `numero_chiffre`, `expire_le` (date),
  `deposee_a`, `verifiee_par`, `verifiee_a`, `motif_refus`.
- **`versement_covoiturage`** : `id`, `reservation_id` **unique**, `conducteur_id`, `montant`, `motif`
  (`confirmation_passager`, `delai_depasse`, `annulation_tardive`), `statut` (`a_faire`, `fait`, `echoue`),
  `reference`, `tentatives`, `prochain_essai_a`, `derniere_erreur`, `cree_a`, `fait_a`. Index sur
  `(statut, prochain_essai_a)`. Seul un code d'erreur court y est écrit, jamais le texte du prestataire.
- **`demande_covoiturage`** : `id`, `passager_id`, `depart_ville`, `arrivee_ville`, `jour` (date), `moment`
  (`matin`, `apres_midi`, `soir`, null), `places`, `statut` (`ouverte`, `annulee`, `satisfaite`, `expiree`),
  `cree_a`. Index sur `(statut, jour)`.
- **`proposition_covoiturage`** : `(demande_id, conducteur_id, trajet_id)` unique, `envoyee_a`.
- **`note_covoiturage`** : `id`, `reservation_id`, `note_id` (qui est noté), `role_note` (`conducteur`,
  `passager`), `auteur_id`, `valeur` (1 à 5), `commentaire`, `cree_a`. **Unique**
  `(reservation_id, role_note)`.
- **`trajet_regulier_passager`** : `voyageur_id` (clé), `ville`, `depart_point`, `arrivee_point`, `depart_a`
  (`HH:MM`), `actif`, `modifie_a`.

Aucune table n'a de `ON DELETE CASCADE` vers les comptes : un trajet et son argent doivent rester lisibles
pour l'audit.

## Tests

`pnpm --filter @afrimove/api test -- src/covoiturage` :

- `regles.test.ts`, `parite.test.ts` : règles pures (frais, annulation, libération, vérification, chevauchement) et
  parité avec `@afrimove/domain` (250 F, devis, blocage de 15 minutes) ;
- `contrats.test.ts` : les lecteurs de requêtes et les vues disent la même chose que les schémas zod ;
- `*.service.test.ts`, `balayage.test.ts` : services sur ports en mémoire, horloge réglable
  (`testing/montage.ts`) ;
- `covoiturage.e2e.test.ts` : l'API complète (gardes, rôles, audit) avec la vraie billetterie et les paiements,
  paiement par webhook signé, réponses validées par les schémas de `@afrimove/contrats` ;
- `covoiturage.module.test.ts` : le démarrage en production est refusé tant qu'un port est en mémoire ;
- `covoiturage.sequestre.test.ts` : sans compte de séquestre, payer une réservation est refusé.

## Décisions à confirmer

Ces valeurs ne viennent d'aucune consigne du ticket ; elles sont toutes réglables (variables ci-dessus) ou
isolées dans `regles.ts` :

- Annulation gratuite jusqu'à 2 h avant le départ, puis 50 % du prix pour le conducteur ; les frais de 250 F ne
  sont jamais rendus au passager qui annule, toujours rendus si c'est le conducteur.
- Réservations closes 30 minutes avant le départ ; publication au plus 60 jours à l'avance, au moins 30 minutes.
- Prix : plafonné à la borne haute du conseil (Douala ↔ Kribi : 4 500 F), 1 000 F en ville, 20 000 F sans
  conseil ; plancher de 100 F. Durées par défaut : 6 h entre villes, 45 min en ville.
- Une confirmation d'arrivée n'est possible qu'à partir de l'heure du départ.
- Trois demandes ouvertes au plus par passager.
- Séquestre : le prix des places transite par un compte de l'agrégateur au nom d'AfriMove, ce qui suppose que
  l'agrégateur et la réglementation l'autorisent (AfriMove détient alors l'argent des conducteurs entre le
  paiement et l'arrivée).
- Un versement sur le numéro MoMo du compte du conducteur par défaut, ou celui qu'il a choisi.

## Ce qui n'a pas pu être vérifié

- Aucun appel réel à un agrégateur : l'encaissement passe par l'agrégateur simulé, le versement au conducteur
  par une passerelle simulée.
- Aucune base PostgreSQL : les index et transactions décrits ci-dessus ne sont pas exécutés.
- Les distances d'itinéraire en ville ne sont pas calculées (`distanceKm: 0`), faute de service de cartographie.
