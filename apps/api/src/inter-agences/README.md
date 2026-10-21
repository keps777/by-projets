# Inter-agences (AM-135)

Module Nest `InterAgencesModule` : conventions entre deux compagnies signées par le PIN des deux patrons, colis
en correspondance (un seul numéro, deux tronçons, deux compagnies payées), billets voyageurs en correspondance
(25 minutes garanties, le second bus attend 15 minutes, sinon replacement gratuit), transfert de responsabilité
au scan « remis à » / « reçu », règlement hebdomadaire (période gelée le dimanche 20:00, solde net réglé par
MoMo le lundi 08:00) et contestation du relevé.

Le module est autonome : tous ses accès extérieurs sont des **ports** (classes abstraites, `ports.ts`) avec une
version **en mémoire** (`memoire.ts`). Pour le stockage (conventions, colis et billets en correspondance,
règlements, contestations, invitations, références) et pour les lectures de la billetterie (annuaire des
compagnies, départs, billets vendus) il a aussi une version **PostgreSQL** (`postgres.ts`, lot B) choisie par
`API_STOCKAGE` (voir `apps/api/INTEGRATION.md`). Il est dans `AppModule`. Seul le paiement du solde net
(`ReglementsMobile`) reste simulé. Il importe `ColisModule` (lecture du colis partenaire, référentiel,
numérotation) et `VerificateurSignature` (`modules/signature`, PIN des patrons).

## Brancher le module

**Fait (lot B)**

1. `InterAgencesModule` est dans les `imports` de `AppModule` (après `FinancementModule`).
2. Adaptateurs PostgreSQL de `ConventionsRepository`, `ColisInterAgences`, `BilletsCorrespondance`, `Reglements`,
   `Contestations`, `InvitationsCompagnies`, `CompteursReferences`, `AnnuaireCompagnies`, `DepartsInterAgences` et
   `BilletsEmis` (`postgres.ts`), migration `20261017000806_inter_agences`. Les noms et téléphones des voyageurs,
   les téléphones des invitations et les numéros MoMo des compagnies sont chiffrés par `ChiffrementService`
   (contextes `inter-agences.voyageur.nom`, `inter-agences.voyageur.telephone`,
   `inter-agences.invitation.telephone`, `inter-agences.momo.telephone`).
3. `BranchementInterAgencesColis` remplace au démarrage `ReferentielColis.interAgencesDisponible` par « la
   compagnie a une convention en vigueur » : le guichet colis ne propose « Autre ville via une autre compagnie »
   qu'à ces compagnies. Les tests du module colis (`colis/testing/app-colis-test.ts`) repilotent ce calcul avec
   l'indicateur du référentiel en mémoire.
4. Les tâches de fond (`TachesInterAgences`) démarrent seules hors tests : toutes les 15 minutes, elles
   appliquent les sorties dont le préavis est écoulé et arrêtent puis paient les règlements échus (lundi 08:00
   inclus). La clé unique du règlement, la table `creance_reglee` (une opération ne se règle qu'une fois) et la
   clé d'idempotence du paiement empêchent un double paiement, y compris sur plusieurs instances.

**Reste à faire**

5. Brancher `ReglementsMobile` sur l'opérateur MoMo et Orange Money (AM-165). Il doit être **idempotent par
   `cle`** (`<conventionId>:<AAMMJJ du lundi>`) : la tâche de fond rejoue la même clé après un résultat inconnu.
6. Écrire les comptes MoMo des compagnies (`compte_momo_compagnie`) : **aucune route ne les écrit** ; sans ligne,
   le règlement reste `a_payer` (motif « compte MoMo manquant »). Reste à décider où le patron les saisit.
7. Un verrou d'instance (`pg_advisory_lock`) pour les tâches de fond évitera du travail en double si l'API tourne
   sur plusieurs processus.

En production, `VerificationPortsInterAgences` **refuse de démarrer** tant qu'un des 11 ports est en mémoire ou
simulé (`durable === false`) et nomme les ports concernés (aujourd'hui : `ReglementsMobile`).

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

- **Convention : un seul contrat** (réglé). `patron.ConventionSchema` est désormais `colis.SchemaConvention`
  (complet : `moi`, `delaiLitigeJours`, `pied`). L'API le sert sous `/inter-agences/conventions/:id` et, pour
  `patron.interAgences.convention`, sous `/patron/inter-agences/conventions/:id` (même réponse, même étanchéité).
  L'ancienne forme patron (compagnies, signeeLe, parts à colisType) n'était servie par personne ni lue par un écran.
- **Origine du billet voyageur en correspondance** (réglé) : `patron.InterAgences.correspondanceVoyageurs.trajet`
  (facultatif : origine, via, destination, première et seconde compagnie) vient de la première ligne voyageurs de la
  convention choisie, la même donnée que `GET /inter-agences/correspondances` (qui garde toutes les lignes). Absent
  quand la convention n'a pas de ligne voyageurs. `colis.SchemaInterAgences.voyageurs` (planche colis) reste sans
  ces champs : il faut `/correspondances`.
- **Planche patron `patron.interAgences.vue`** : elle ne montre qu'une compagnie partenaire et qu'un colis.
  `?conventionId=` choisit la convention. `colisEnCorrespondance` est **facultatif** : sans échange en cours ou sans
  convention la clé est absente (plus de colis type vide, et la réponse passe toujours le schéma).

## Tables PostgreSQL

**Écrites par la migration `20261017000806_inter_agences`** (modèles en fin de `schema.prisma`, bloc « lot B »).
Comme le reste du schéma, les **colonnes sont en camelCase** (`compagnieAId`, `emettriceId`…) : les noms en
snake_case de la description d'origine se lisent ainsi. Les montants sont des entiers FCFA, les instants des
`timestamptz`. Ce sont ces contraintes qui garantissent les propriétés que les ports en mémoire simulent.

| Table                      | Contenu                                                                                                                                                     | Garde-fous de la base                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `convention_inter_agences` | `version` (concurrence optimiste : `UPDATE … WHERE id AND version`), compagnies A et B, statut, renouvellement, `parts` et `voyageurs` (JSON), dénonciation | **index unique partiel** sur la paire triée `(LEAST, GREATEST)` pour les statuts ouverts ; deux compagnies distinctes et connues ; valeurs fermées ; ne se supprime pas (se résilie) |
| `signature_convention`     | une signature par compagnie et par convention (clé primaire), `rang` pour l'ordre                                                                           | personne et compagnie existantes ; en ajout seul                                                                                                                                     |
| `colis_inter_agences`      | un plan par colis (clé primaire) : `troncons` et `transferts` en JSON, `compagnieIds` (uuid[]) pour retrouver les échanges d'une compagnie                  | clés étrangères colis, compagnie, personne ; index GIN sur `compagnieIds`                                                                                                            |
| `billet_correspondance`    | un plan par billet vendu (clé = identifiant du billet), numéro unique, nom et téléphone du voyageur **chiffrés**, tronçons, arrivée, replacement            | clé étrangère billet ; index GIN sur `compagnieIds`                                                                                                                                  |
| `reglement_inter_agences`  | un règlement par `cle` (`<convention>:<AAMMJJ>`) ; `lignes` gardées en JSON ; `UPDATE … WHERE cle AND etat` pour changer d'état                             | débiteur et créancier nuls ensemble, et exactement quand le solde est nul ; un règlement payé a référence et date ; **un règlement clos ne change plus** ; ne se supprime pas        |
| `creance_reglee`           | une ligne par opération réglée, clé primaire = `cle` de la créance (`colis:<id>:<rang>`, `billet:<id>:<rang>`, `replacement:<id>`)                          | une opération ne se règle qu'une fois : le doublon fait échouer l'insertion du règlement ; en ajout seul                                                                             |
| `contestation_reglement`   | `reference` (`CTX-AAMMJJ-n`), `conventionIds` (uuid[]), `cles` (text[]), statut, résolution                                                                 | recevable exactement quand non irrecevable ; résolue exactement quand accordée ou rejetée ; **une contestation close ne change plus** ; ne se supprime pas                           |
| `invitation_compagnie`     | `reference` (`INV-AAMMJJ-n`), `cle` unique (une invitation par compagnie, numéro et jour), téléphone **chiffré**                                            | compagnie et personne existantes ; en ajout seul                                                                                                                                     |
| `compte_momo_compagnie`    | une ligne par compagnie : numéro MoMo **chiffré** et opérateur                                                                                              | opérateur `mtn` ou `orange`                                                                                                                                                          |

Les références `INV-…` et `CTX-…` utilisent la table de compteurs `compteur_dossier` (une ligne par préfixe,
`INSERT … ON CONFLICT DO UPDATE … RETURNING` : sans trou, sans doublon). Les ports `AnnuaireCompagnies`,
`DepartsInterAgences` et `BilletsEmis` lisent des tables qui existent déjà (compagnie, ligne, gare, bus, départ,
billet) ; ils ne créent rien.

Écarts avec la description d'origine : les `lignes` du règlement restent en JSON, doublées de `creance_reglee`
pour l'unicité ; les tronçons restent en JSON, avec un tableau `compagnieIds` indexé (GIN) au lieu d'une table
fille ; le **nom** du voyageur est chiffré lui aussi ; `AnnuaireCompagnies` rend `compagnie.nom` (le nom complet,
il n'y a pas de nom court en base) ; l'arrivée d'un départ est `départ + ligne.dureeMinutes` ; `prochain` ignore
les départs annulés ou fusionnés ; un billet sans téléphone donne une chaîne vide.

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

## Tests

- `*.test.ts`, `*.e2e.test.ts` : règles, validation et API complète sur les ports en mémoire.
- `postgres.integration.test.ts` (avec `DATABASE_URL_TEST`) : le contrat des ports (`testing/contrat-ports.ts`)
  sur la mémoire et sur PostgreSQL (une seule convention ouverte par paire dans l'ordre que l'on veut, un
  règlement par clé, une créance réglée une seule fois, références sans trou, départs et billets lus dans la
  billetterie) ; puis les garde-fous de la base (téléphones et noms jamais en clair, index unique partiel par SQL
  direct, valeurs fermées, règlement et contestation clos figés, conventions qui ne se suppriment pas) et la
  reprise après une nouvelle connexion.
- `api.postgres.integration.test.ts` : de la proposition de convention au règlement du lundi, sur PostgreSQL :
  deux patrons signent par leur PIN, colis enregistré et transféré par scans, billet équipé puis replacement après
  15 minutes de retard, contestation tranchée par AfriMove, invitation rejouée, règlement du lundi payé par le
  MoMo simulé, puis redémarrage de l'API sans second paiement.

## Reste à faire

- `ReglementsMobile` (AM-165) et la saisie des comptes MoMo des compagnies.
- Compléter le contrat patron (voir « Désaccords de contrat »).
- Verrou d'instance pour les tâches de fond si l'API tourne sur plusieurs processus.
- Plus de deux tronçons (trois compagnies) : le modèle de données le permet (`transferts` par rang), pas les
  routes (`troncons_non_pris_en_charge`).
- Suspension d'une convention (`suspendue`) : le statut existe, aucune route ne le pose.
