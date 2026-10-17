# Inter-agences (AM-135)

Module Nest `InterAgencesModule` : conventions entre deux compagnies signées par le PIN des deux patrons, colis
en correspondance (un seul numéro, deux tronçons, deux compagnies payées), billets voyageurs en correspondance
(25 minutes garanties, le second bus attend 15 minutes, sinon replacement gratuit), transfert de responsabilité
au scan « remis à » / « reçu », règlement hebdomadaire (période gelée le dimanche 20:00, solde net réglé par
MoMo le lundi 08:00) et contestation du relevé.

Le module est autonome : tous ses accès extérieurs sont des **ports** (classes abstraites, `ports.ts`) avec une
version **en mémoire** (`memoire.ts`). Il n'est **pas** dans `AppModule` et n'a **pas** d'adaptateur PostgreSQL :
l'intégration est faite par le coordinateur (voir « Brancher le module »). Il importe `ColisModule` (lecture du
colis partenaire, référentiel, numérotation) et `VerificateurSignature` (`modules/signature`, PIN des patrons).

## Brancher le module

À faire par le coordinateur (le brief interdit de toucher `app.module.ts` et `prisma/schema.prisma`) :

1. Ajouter `InterAgencesModule` aux `imports` de `AppModule` (après `ColisModule`).
2. Écrire les adaptateurs PostgreSQL des ports (voir « Tables PostgreSQL ») et les fournir à la place des
   versions en mémoire : `ConventionsRepository`, `ColisInterAgences`, `BilletsCorrespondance`, `Reglements`,
   `Contestations`, `InvitationsCompagnies`, `CompteursReferences`.
3. Brancher les lectures dans les autres modules : `AnnuaireCompagnies` (nom court et compte MoMo de la
   compagnie), `DepartsInterAgences` (départs de la billetterie : ligne, heures, bus ; `prochain` pour le
   replacement), `BilletsEmis` (billets vendus, par identifiant ou numéro).
4. Brancher `ReglementsMobile` sur l'opérateur MoMo et Orange Money (AM-165). Il doit être **idempotent par
   `cle`** (`<conventionId>:<AAMMJJ du lundi>`) : la tâche de fond rejoue la même clé après un résultat inconnu.
5. Les tâches de fond (`TachesInterAgences`) démarrent seules hors tests : toutes les 15 minutes, elles
   appliquent les sorties dont le préavis est écoulé et arrêtent puis paient les règlements échus (lundi 08:00
   inclus). Sur plusieurs instances, un verrou (`pg_advisory_lock`) évitera du travail en double ; sans verrou,
   la clé unique du règlement et la clé d'idempotence du paiement empêchent un double paiement.
6. `BranchementInterAgencesColis` remplace au démarrage `ReferentielColis.interAgencesDisponible` par
   « la compagnie a une convention en vigueur » : le guichet colis ne propose « Autre ville via une autre
   compagnie » qu'à ces compagnies. Si le référentiel PostgreSQL du module colis fournit déjà ce calcul, retirer
   ce branchement.

En production, `VerificationPortsInterAgences` **refuse de démarrer** tant qu'un des 11 ports est en mémoire ou
simulé (`durable === false`) et nomme les ports concernés.

## Routes

Les noms d'opérations et les schémas sont ceux de `@afrimove/contrats` et de `@afrimove/api-client`
(`colis/operations.ts`, `patron/…`). Les réponses sont validées avec les schémas zod dans les tests e2e.

| Route                                         | Rôle              | Opération                        |
| --------------------------------------------- | ----------------- | -------------------------------- |
| `GET /inter-agences`                          | patron, comptable | `colis.inter-agences.lire`       |
| `GET /inter-agences/reglement`                | patron, comptable | `colis.inter-agences.reglement`  |
| `POST /inter-agences/reglement/contestations` | patron            | `colis.inter-agences.contester`  |
| `POST /inter-agences/transferts`              | terrain           | `colis.inter-agences.transfert`  |
| `GET /inter-agences/conventions/:id`          | patron, comptable | `colis.inter-agences.convention` |
| `POST /inter-agences/invitations`             | patron            | `colis.inter-agences.inviter`    |
| `GET /patron/inter-agences?conventionId=`     | patron, comptable | `patron.interAgences.vue`        |

« terrain » : convoyeur, chauffeur, guichetier, contrôleur, superviseur.

Routes **ajoutées**, absentes des contrats (à confirmer ou à déplacer dans les contrats) :

| Route                                                        | Rôle                            | Usage                                                                            |
| ------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------- |
| `GET /inter-agences/propositions`                            | patron                          | les conventions proposées, en attente de signature                               |
| `POST /inter-agences/conventions`                            | patron (PIN)                    | proposer une convention                                                          |
| `POST /inter-agences/conventions/:id/signatures`             | patron (PIN)                    | signer la proposition de l'autre compagnie : la convention est en vigueur        |
| `POST /inter-agences/conventions/:id/denonciation`           | patron (PIN)                    | demander la sortie (préavis de 30 jours)                                         |
| `GET /inter-agences/correspondances`                         | patron, comptable               | **l'origine du billet voyageur** : origine, via, destination, première compagnie |
| `POST /inter-agences/colis`                                  | guichetier, superviseur, patron | enregistrer un colis en correspondance (`colisId`, `departIds`)                  |
| `GET /inter-agences/colis/:colisId`                          | patron, comptable, terrain      | plan du colis, parts, qui en est responsable                                     |
| `POST /inter-agences/billets`                                | guichetier, superviseur, patron | équiper un billet vendu d'un second tronçon (`billet`, `departId`)               |
| `GET /inter-agences/billets`, `…/billets/:reference`         | patron, comptable, terrain      | les billets en correspondance                                                    |
| `POST /inter-agences/billets/:reference/embarquements`       | terrain                         | le voyageur monte dans le bus du tronçon `rang` (rend la part due)               |
| `POST /inter-agences/billets/:reference/arrivee-premier-bus` | terrain                         | constater l'arrivée du premier bus : à l'heure, attente ou replacement           |
| `POST /inter-agences/contestations/:reference/resolution`    | afrimove                        | trancher une contestation (`accordee` ou `rejetee`)                              |

Corps d'erreur : `{ code, message, details? }` (celui du module colis). Les signatures des patrons suivent
`modules/commande` : `401 PIN_REQUIS`, `403 PIN_INCORRECT`, `423 PIN_BLOQUE`, `422 SIGNATURE_PERIMEE`.
Codes ajoutés : `colis_introuvable`, `billet_introuvable`, `convention_introuvable`, `contestation_introuvable`,
`depart_introuvable`, `compagnie_introuvable`, `colis_hors_inter_agences` (404, y compris pour une compagnie
qui n'est pas partie à l'échange) ; `pas_le_porteur`, `pas_le_preneur`, `pas_votre_troncon` (403) ;
`remise_non_scannee`, `colis_arrive`, `deja_enregistre`, `deja_signee`, `deja_denoncee`, `convention_existante`,
`billet_annule`, `pas_embarque`, `troncon_precedent`, `aucun_depart_suivant`, `deja_resolue`, `etat_incompatible`
(409) ; `mauvais_preneur`, `pas_de_convention`, `parts_invalides`, `ligne_voyageurs_invalide`,
`premier_troncon_autre_compagnie`, `meme_compagnie`, `correspondance_impossible`, `correspondance_trop_courte`,
`ligne_non_prevue`, `troncons_non_pris_en_charge`, `port_inconnu`, `releve_vide`, `colis_hors_releve`,
`telephone_invalide`, `troncon_inconnu` (422).

## Règles appliquées

- **Une convention n'existe qu'à deux signatures** : la proposition (PIN du patron de A) crée une convention
  `proposee`, illisible par les écrans ; la signature de B (PIN du patron de B) la rend `active`. Une seule
  convention ouverte par paire de compagnies, dans l'ordre que l'on veut. Les parts doivent faire le prix du
  colis type (3 000 F : par exemple 1 600 F + 1 400 F, les lignes « Transbordement » comptées pour chaque
  compagnie qui en reçoit une part). Le frais AfriMove de 150 F est affiché, payé par l'émetteur, jamais réparti.
- **Sortie** : un patron demande la sortie (PIN) ; elle prend effet **30 jours** plus tard. La convention reste
  active entre-temps, les colis en route vont au bout ; la tâche de fond la passe à `resiliee` à l'échéance.
  Après la résiliation, on peut proposer une nouvelle convention à la même compagnie.
- **Colis** : un plan par colis (premier tronçon = la compagnie qui a vendu le colis, second tronçon = un départ
  d'une compagnie liée, qui part de la ville d'arrivée du premier, après son arrivée). Deux tronçons au plus.
  La part de chaque tronçon se calcule sur le **port réellement payé** (`colis.port`), au prorata des totaux de
  la convention, arrondi au plus grand reste (la somme est exacte).
- **Responsabilité** : « remis à » (convoyeur du cédant) puis « reçu » (convoyeur du preneur). Tant que « reçu »
  n'est pas scanné, le colis est à la compagnie qui le cède. « Reçu » avant « remis à » : 409. La compagnie
  annoncée dans le scan se lit par nom (sans casse ni accent) ou identifiant. Rejouer un scan ne change rien
  (même horodatage, pas de second SMS ni de seconde trace d'audit).
- **Créances** : elles viennent **uniquement des scans**. Colis : la part d'un tronçon est due à la compagnie
  qui le conduit, par l'émettrice (qui a encaissé le client), quand son passage de témoin est complet
  (« remis à » et « reçu »). Billet : la part d'un tronçon est due quand le voyageur y est monté (embarquement
  scanné par la compagnie qui le conduit). Rien n'est dû sur un enregistrement seul.
- **Billets** : le billet vendu garde son numéro. Il faut 25 minutes au moins entre l'arrivée prévue du premier
  bus et le départ du second, et une ligne voyageurs de la convention (origine, via, destination, première
  compagnie = celle qui vend). L'arrivée réelle du premier bus est constatée à la gare de correspondance : à
  l'heure, ou jusqu'à 15 minutes de retard (le second bus attend, SMS au voyageur), ou replacement gratuit sur
  le départ suivant de la seconde compagnie, **à la charge du retardataire** (siège perdu payé à la seconde
  compagnie, SMS au voyageur). La décision ne se prend qu'une fois.
- **Règlement** : un règlement par convention et par lundi (`<conventionId>:<AAMMJJ>`). Les opérations
  acquises avant le dimanche 20:00 sont réglées le lundi 08:00 ; celles d'après vont à la semaine suivante.
  Le solde net compense ce que chacun doit à l'autre ; la compagnie qui doit le plus paie la différence par
  MoMo. Une opération réglée une fois ne revient jamais. Un refus de l'opérateur ou un compte MoMo manquant
  laisse le règlement `a_payer` (motif noté), repris à la tâche suivante.
- **Contestation** : jusqu'au dimanche 20:00 (`recevable: true`), elle sort les opérations désignées (tout le
  relevé sans `colisIds`) du règlement jusqu'à la décision d'AfriMove ; l'autre patron est prévenu par SMS.
  Après le gel, elle est enregistrée mais **non recevable** (`recevable: false`, statut `irrecevable`) et ne
  retient rien. Décision : `accordee` (écartée pour de bon) ou `rejetee` (réglée au lundi suivant).
- **Étanchéité** : un colis, un billet, une convention ou une contestation d'une autre paire de compagnies
  répond « inconnu » (404). Une réponse ne porte que ce que la compagnie connectée peut voir.
- **Validation** : `validation.ts` relit les corps à la main (l'API n'importe pas zod à l'exécution) et
  `validation.test.ts` les compare aux schémas des contrats.

## Désaccords de contrat

- **Deux contrats « convention »** : le patron (`patron.ConventionSchema`) est un sous-ensemble de celui du
  colis (`colis.SchemaConvention`) : il manque `moi` (dans les signatures), `delaiLitigeJours` (dans le
  trimestre), `pied` et la ponctuation des titres de règles. L'API sert le contrat colis, complet, sous
  `/inter-agences/conventions/:id`. L'écran patron doit lire celui-là, ou le contrat patron être complété.
- **Origine du billet voyageur en correspondance** : `colis.SchemaInterAgences.voyageurs` ne porte que le texte
  et les minutes. Les contrats sont `strictObject` : impossible d'y ajouter un champ sans les modifier. La
  route ajoutée `GET /inter-agences/correspondances` donne les lignes structurées (origine, via, destination,
  première et seconde compagnie, minutes, texte).
- **Planche patron `patron.interAgences.vue`** : elle ne montre qu'une compagnie partenaire et qu'un colis
  (obligatoire). `?conventionId=` choisit la convention ; sans colis en correspondance, `colisEnCorrespondance`
  est rempli d'un colis type (`numero` vide, aucun tronçon). Sans aucune convention, `colisId` est vide et la
  réponse ne passe pas le schéma : il faudrait rendre `colisEnCorrespondance` optionnel dans le contrat.

## Tables PostgreSQL

À créer par le coordinateur dans `prisma/schema.prisma`. Les montants sont des entiers FCFA, les instants des
`timestamptz`. Les téléphones des voyageurs (`billet_correspondance.voyageur_telephone`) sont à **chiffrer**
(`ChiffrementService`), comme les numéros MoMo des compagnies.

**`convention_inter_agences`** (`ConventionStockee`) : `id` (uuid), `version` (int, concurrence optimiste),
`compagnie_a_id`, `compagnie_b_id` (A propose, B accepte), `statut` (`proposee`, `active`, `suspendue`,
`resiliee`), `renouvellement` (`trimestriel`, `annuel`), `parts` (jsonb : colis type et lignes),
`voyageurs` (jsonb : garantie, attente, lignes), `proposee_le`, `active_le` (nul), `denonciation` (jsonb nul :
qui, quand, effet). **Index unique partiel** sur la paire triée
`(LEAST(compagnie_a_id, compagnie_b_id), GREATEST(…)) WHERE statut IN ('proposee','active','suspendue')` :
une seule convention ouverte par paire (`ajouter` renvoie `paire_deja_ouverte`). `remplacer` =
`UPDATE … WHERE id = $1 AND version = $2`. Index `(compagnie_a_id)` et `(compagnie_b_id)`.

**`signature_convention`** : `convention_id`, `compagnie_id`, `personne_id`, `signe_le`. Clé primaire
`(convention_id, compagnie_id)` : une signature par compagnie.

**`colis_inter_agences`** (`ColisInterAgencesStocke`) : `colis_id` (clé, un plan par colis), `version`,
`numero`, `convention_id`, `emettrice_id`, `prix`, `troncons` (jsonb : rang, compagnie, départ, trajet, heures,
bus, part), `transferts` (jsonb : rang, cédant, preneur, `remis` et `recu` : instant, personne, lieu),
`cree_le`, `cree_par`. Index `(convention_id)`. L'accès par compagnie (`lister({ compagnieId })`) demande un
index sur les compagnies des tronçons : une table fille `troncon_colis_inter_agences (colis_id, rang,
compagnie_id, …)` est plus simple qu'un index jsonb.

**`billet_correspondance`** (`BilletCorrespondanceStocke`) : `id` (= billet vendu), `version`, `numero`
(unique), `convention_id`, `emettrice_id`, `voyageur_nom`, `voyageur_telephone` (chiffré), `prix`, `troncons`
(jsonb : comme le colis plus `etat` `prevu|embarque|replace` et `embarque_le`), `arrivee_premier_bus` (jsonb
nul), `replacement` (jsonb nul : décision, départ, bus, retardataire, montant), `cree_le`, `cree_par`. Même
remarque d'index par compagnie que pour le colis.

**`reglement_inter_agences`** (`ReglementStocke`) : `cle` (clé primaire, `<convention>:<AAMMJJ>` : `ajouter`
renvoie `false` si elle existe), `convention_id`, `paiement_le`, `gel_le`, `lignes` (jsonb : les créances
réglées, avec leur `cle` `colis:<id>:<rang>`, `billet:<id>:<rang>`, `replacement:<id>`), `debiteur_id` et
`creancier_id` (nuls si solde nul), `montant`, `etat` (`a_payer`, `paye`, `sans_solde`), `reference` (opérateur),
`paye_le`, `erreur`. `remplacer` = `UPDATE … WHERE cle = $1 AND etat = $2`. Pour ne jamais régler deux fois une
opération, ajouter une table fille `reglement_ligne (cle_creance UNIQUE, reglement_cle)`.

**`contestation_reglement`** (`ContestationStockee`) : `reference` (clé, `CTX-AAMMJJ-n`), `convention_ids`
(uuid[]), `compagnie_id`, `personne_id`, `motif`, `cles` (text[] des créances contestées), `deposee_le`,
`recevable`, `statut` (`ouverte`, `accordee`, `rejetee`, `irrecevable`), `resolue_le`, `resolue_par`.
`remplacer` = `UPDATE … WHERE reference = $1 AND statut = $2`. Index `(statut)` et `(compagnie_id)`.

**`invitation_compagnie`** (`InvitationStockee`) : `reference` (clé, `INV-AAMMJJ-n`), `cle` (unique,
`<compagnie>:<téléphone>:<AAMMJJ>` : une invitation par compagnie, numéro et jour), `compagnie_id`,
`personne_id`, `nom_compagnie`, `telephone` (chiffré), `envoyee_le`.

**`compteur_reference`** : `prefixe` (clé), `valeur`. `prochain(prefixe)` = `INSERT … ON CONFLICT DO UPDATE
SET valeur = valeur + 1 RETURNING valeur` (atomique, sans trou). Peut être la table de compteurs déjà utilisée
par les autres modules (préfixes `INV-…` et `CTX-…`).

Les ports `AnnuaireCompagnies`, `DepartsInterAgences` et `BilletsEmis` lisent des tables qui existent déjà
(compagnies, départs et billets de la billetterie) : pas de nouvelle table. La compagnie a besoin d'un **compte
MoMo** (`momo_telephone` chiffré, `momo_operateur`) pour payer et recevoir le solde net.

## Décisions à confirmer

- **Replacement : le siège perdu s'ajoute au trajet de remplacement.** Le retardataire (Alpha dans les tests)
  doit à la seconde compagnie la part du tronçon manqué (le siège qui est parti vide), **et** la part du
  tronçon de remplacement quand le voyageur y monte. Si le siège perdu doit être le seul paiement, il faut ne
  pas compter l'embarquement de remplacement (`creancesDuBillet`, `regles.ts`).
- **Les créances du colis** : la compagnie qui n'est pas l'émettrice est payée par l'émettrice, qui a encaissé
  le client. Les frais AfriMove (150 F) ne figurent dans aucune part.
- **Heure de gel** : une opération scannée après le dimanche 20:00 passe à la semaine suivante.
- **Pas de rôle « agent de correspondance »** : tout rôle de terrain d'une compagnie (convoyeur, chauffeur,
  guichetier, contrôleur, superviseur) peut scanner un transfert et constater l'arrivée du premier bus.
- **Qui engage la compagnie** : seuls les patrons proposent, signent, dénoncent, invitent et contestent. Le
  comptable lit les conventions et le règlement.
- **La contestation après le gel est enregistrée** (référence rendue, `recevable: false`) plutôt que refusée,
  comme le contrat le prévoit.
- Les lignes voyageurs sont des parts **par compagnie**, indépendantes des parts colis.
- Textes inventés (SMS, messages d'erreur, `VOYAGEURS_AUCUN`) : voir `contenu.ts` et les services.

## Reste à faire

- Adaptateurs PostgreSQL des ports ci-dessus, tables et migrations Prisma (coordinateur).
- `AnnuaireCompagnies`, `DepartsInterAgences`, `BilletsEmis` (billetterie), `ReglementsMobile` (AM-165).
- Compléter le contrat patron (voir « Désaccords de contrat »).
- Verrou d'instance pour les tâches de fond si l'API tourne sur plusieurs processus.
- Plus de deux tronçons (trois compagnies) : le modèle de données le permet (`transferts` par rang), pas les
  routes (`troncons_non_pris_en_charge`).
- Suspension d'une convention (`suspendue`) : le statut existe, aucune route ne le pose.
