# Vendeurs ambulants (AM-149)

Module Nest `VendeursModule` : agrément des vendeurs par les agences, vente d'un billet **au nom d'un voisin**,
paiement MoMo de l'agence par le vendeur dans la minute, commissions (100 F par billet classique, 150 F par
billet VIP) versées le lundi.

Règle d'or de l'écran, et critère du ticket : **le vendeur ne détient jamais l'argent du billet au-delà du
paiement immédiat.** Le voisin lui remet le prix, il le règle aussitôt à l'agence par mobile money (une
demande de confirmation part sur son téléphone) et l'argent va de son compte au compte de la compagnie. Tant
que l'agence n'a pas reçu l'argent, il n'y a **ni billet, ni SMS, ni commission** : le siège est seulement
retenu. Sa commission, elle, ne vient jamais du prix du billet : elle est créditée dans un registre à part et
versée le lundi.

Le module est autonome : tous ses accès extérieurs sont des **ports** (classes abstraites, `ports.ts`) avec une
version **en mémoire** (`memoire.ts`) pour ce qui est du stockage. Il n'est **pas** dans `AppModule` et n'a
**pas** d'adaptateur PostgreSQL : l'intégration est faite par le coordinateur (voir « Brancher le module »).
Pour la billetterie, les paiements et les SMS, le module fournit déjà de **vrais adaptateurs** (`adaptateurs.ts`)
qui passent par les services exportés des modules existants, sans rien y modifier.

## Brancher le module

À faire par le coordinateur (le brief interdit de toucher `app.module.ts` et `prisma/schema.prisma`) :

1. Ajouter `VendeursModule` aux `imports` de `AppModule` (il importe lui-même `BilletterieModule`,
   `PaiementsModule`, `SmsModule` et `RelaisModule`).
2. Écrire les adaptateurs PostgreSQL des ports de stockage (voir « Tables PostgreSQL ») et les fournir à la
   place des versions en mémoire : `VendeursRepository`, `AgrementsRepository`, `NumerosVendeurs`,
   `VentesRepository`, `CommissionsVendeurs`. Noms et téléphones sont chiffrés par `ChiffrementService`
   (index aveugle pour retrouver un voisin).
3. Brancher `ComptesVendeurs.ouvrir` : retrouver le compte de ce téléphone ou en créer un, lui ajouter le rôle
   `vendeur` à `personne.roles` (le socle n'a pas d'opération de changement de rôles) et, pour un compte neuf,
   lui envoyer son PIN provisoire par SMS. L'identifiant du vendeur est le `personne.id` de ce compte.
4. Le règlement de l'agence (`ReglementsAgence`) passe par `PaiementsService.payerAuGuichet` : il faut que
   chaque compagnie ait un compte de reversement chez l'agrégateur (sinon la vente est refusée proprement, 402).
   Les versements de commissions utilisent `VersementsMobile` (module relais), à brancher sur l'envoi d'argent
   MoMo et Orange Money (AM-165), idempotent par clé.
5. Option : brancher l'événement `billet.emis` sur la passerelle SMS. Le SMS du billet vendu a la même clé
   (`billet:<id>:<numéro>`) que celui du guichet : le voisin ne reçoit jamais deux messages.
6. Les tâches de fond (`TachesVendeurs`) démarrent seules hors tests, toutes les 15 secondes : conclusion des
   ventes restées en route, versement du lundi, reprise des versements sans réponse. Sur plusieurs instances,
   plusieurs tâches tournent ; les écritures conditionnelles et les clés d'idempotence rendent cela sans danger.
   Un verrou (`pg_advisory_lock`) évitera du travail en double.

En production, `VerificationPortsVendeurs` **refuse de démarrer** tant qu'un port de stockage est en mémoire
(`durable === false`) et nomme les ports concernés.

Réglages (variables d'environnement, `options.ts`) :

| Variable                      | Défaut                    | Rôle                                                       |
| ----------------------------- | ------------------------- | ---------------------------------------------------------- |
| `VENDEURS_DELAI_REGLEMENT_MS` | `60000`                   | Attente de la confirmation de l'opérateur pendant la vente |
| `VENDEURS_SONDAGE_MS`         | `1000`                    | Intervalle entre deux regards sur l'état du paiement       |
| `VENDEURS_TACHES_MS`          | `15000`                   | Période des tâches de fond (`0` : pas de minuterie)        |
| `VENDEURS_BASE_LIEN_BILLET`   | `https://afrimove.app/b/` | Début du lien du billet dans le SMS (https, finit par `/`) |

## Routes

Les trois premières et la vente sont celles de `@afrimove/api-client` (`packages/api-client/src/colis/operations.ts`
: `vendeur.espace`, `vendeur.departs`, `vendeur.clients`, `vendeur.vendre`) et leurs réponses suivent les schémas
de `@afrimove/contrats` (`colis/vendeur.ts`) ; `*.e2e.test.ts` valide chaque réponse avec ces schémas. Les routes
de l'agence **n'existent pas dans les contrats** : l'écran du vendeur n'en a pas besoin.

| Route                                                | Rôle                | Contrat                                    | Rôle de la route                                        |
| ---------------------------------------------------- | ------------------- | ------------------------------------------ | ------------------------------------------------------- |
| `GET /vendeurs/moi`                                  | vendeur             | `SchemaEspaceVendeur`                      | Fiche, agences, bilan du mois, règle d'or               |
| `GET /vendeurs/moi/departs?jour&origine&destination` | vendeur             | `SchemaDepartsVendeur`                     | Départs des agences qui l'ont agréé (demain par défaut) |
| `GET /vendeurs/moi/clients`                          | vendeur             | `SchemaClientsVendeur`                     | Voisins à qui revendre en une touche                    |
| `POST /vendeurs/moi/ventes`                          | vendeur (`@Vente`)  | `SchemaVenteVendeur` → `SchemaBilletVendu` | Vendre un billet, payer l'agence                        |
| `POST /agence/vendeurs`                              | patron, superviseur | hors contrat                               | Agréer un vendeur (compte créé au besoin)               |
| `GET /agence/vendeurs`                               | patron, superviseur | hors contrat                               | Mes vendeurs, billets et commissions du mois            |
| `POST /agence/vendeurs/:vendeurId/retrait`           | patron, superviseur | hors contrat                               | Retirer l'agrément                                      |
| `PUT /agence/vendeurs/:vendeurId/commissions`        | patron, superviseur | hors contrat                               | Fixer la commission (classique, VIP)                    |

Erreurs (corps `{ code, message, details? }`, celui du module colis) :

| Statut | Code                                                                | Quand                                                                                           |
| ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 400    | `REQUETE_INVALIDE`                                                  | Corps ou paramètres mal formés (`details` nomme chaque champ)                                   |
| 402    | `reglement_refuse`                                                  | L'opérateur a refusé le paiement de l'agence : aucun billet, le vendeur rend l'argent au voisin |
| 403    | `compagnie_non_agreee`, `aucun_agrement`, `vendeur_suspendu`        | Agrément absent, retiré ou compte suspendu                                                      |
| 404    | `vendeur_introuvable`, `depart_introuvable`, `agrement_introuvable` | Rien de tel                                                                                     |
| 409    | `reglement_en_attente`                                              | Pas de réponse de l'opérateur en 60 s : le billet part par SMS dès que l'agence est payée       |
| 409    | `vente_en_cours`                                                    | Une autre vente de ce vendeur attend encore son règlement                                       |
| 409    | `depart_complet`, `depart_ferme`                                    | Plus de place, ou départ parti, annulé ou fermé                                                 |
| 409    | `deja_agree`                                                        | Cette agence a déjà agréé ce vendeur                                                            |
| 422    | `moyen_indisponible`, `moyen_incoherent`                            | Règlement par carte (refusé), ou opérateur différent du numéro MoMo du vendeur                  |

## Règles appliquées

- **Une vente = un billet au nom du voisin** (nom et téléphone du voisin, chiffrés comme tout passager). Le
  billet a le canal `vendeur` et le moyen de paiement du vendeur ; le SMS part au voisin avec son code à 4 chiffres.
- **Déroulé** : vente `en_attente` + siège retenu → demande de paiement (clé = identifiant de la vente) → attente
  de 60 s au plus → `reglee` → billet émis, commission créditée, vente `terminee`. Refus : `refusee`, siège rendu.
  Pas de réponse : 409, puis la tâche de fond conclut (payée → billet et SMS ; refusée ou 10 minutes sans
  réponse → `expiree`, siège rendu).
- **Une seule vente en attente par vendeur** (409 `vente_en_cours`) : le vendeur règle dans la minute, il ne
  porte pas plusieurs paiements ouverts.
- **Rien n'est dû sans billet** : plus de place → refus avant tout paiement ; la place est retenue avant de
  demander l'argent. Si l'agence est payée mais que le billet ne peut plus être émis (départ annulé ou parti
  entre-temps), la vente passe à `a_rembourser` (journal d'audit `vendeur.a_rembourser`) : AfriMove rend l'argent
  au vendeur. Même chose pour un paiement qui arrive plus de 10 minutes après coup sur une vente refusée ou
  expirée (surveillé pendant 24 h, `vendeur.reglement_tardif`).
- **Idempotence** : le billet a son identifiant fixé dès la vente (émettre deux fois ne crée rien de plus) ; le
  paiement a pour clé l'identifiant de la vente ; la commission a pour clé `commission:<venteId>` ; l'état de la
  vente ne change que par comparaison (`transitionner`), si bien que la requête et la tâche de fond peuvent
  arriver ensemble. Renvoyer la même vente (même départ, même voisin) rend le même billet.
- **Agrément** : un vendeur ne vend que les billets des agences qui l'ont agréé. Le patron ou un superviseur
  agrée (compte créé au besoin, numéro `V-0412` donné au premier agrément et jamais changé, SMS au vendeur),
  fixe les commissions (0 à 2 000 F, pour les prochaines ventes seulement) ou retire l'agrément (les billets
  déjà vendus restent valables, les commissions déjà gagnées restent dues).
- **Commissions** : 100 F par billet classique, 150 F par billet VIP, sauf montant fixé par l'agence. Créditées
  seulement quand le billet est émis. Versées **le lundi de 8 h à minuit (Douala)**, solde entier, par MoMo sur
  le numéro de la fiche du vendeur ; la clé du versement (`commissions:<vendeurId>:<AAMMJJ du lundi>`) porte la
  semaine. Le débit est réservé avant l'appel à l'opérateur et confirmé après : une panne entre les deux ne
  perd ni ne double l'argent (une réservation sans réponse est rejouée avec la même clé).
- **Départs proposés** : départs en vente des agences du vendeur, avec bus affecté, un jour donné (demain par
  défaut), du plus tôt au plus tard. Sans trajet demandé : depuis la ville du vendeur vers la destination qu'il
  vend le plus, sinon la plus desservie ce jour-là.
- **Clients** : les voisins à qui le vendeur a vendu dans les 12 derniers mois, regroupés par téléphone, les
  plus récents d'abord (20 au plus), numéro masqué (`6 70 …`). Un client voyage « chaque vendredi » à partir de
  3 voyages dont les deux tiers le même jour ; la proposition « vendredi 08:30 » n'apparaît que s'il existe un
  départ à ce jour et à cette heure dans la semaine à venir, sur le même trajet, avec des places. Sinon, la date
  de son dernier voyage. Un client est « régulier » à partir de 3 billets.

## Tables PostgreSQL

À créer par le coordinateur (le brief interdit de toucher `prisma/schema.prisma`). Les montants sont en francs
CFA entiers ; les instants en `timestamptz`.

### `vendeur`

Une ligne par vendeur. `id` est le `personne.id` du compte (clé étrangère vers la table des personnes).

| Colonne                  | Type               | Remarque                                                          |
| ------------------------ | ------------------ | ----------------------------------------------------------------- |
| `id`                     | uuid, clé primaire | `personne.id`                                                     |
| `version`                | integer            | concurrence optimiste : `UPDATE … WHERE id = $1 AND version = $2` |
| `numero`                 | text, **unique**   | `V-0412`, donné une fois (voir `compteur_numero_vendeur`)         |
| `nom`                    | text chiffré       |                                                                   |
| `telephone_chiffre`      | text chiffré       | téléphone du compte, SMS d'agrément et de versement               |
| `quartier`, `ville`      | text               | la ville est l'origine des départs proposés                       |
| `momo_telephone_chiffre` | text chiffré       | compte mobile money du vendeur                                    |
| `momo_operateur`         | text               | `mtn` ou `orange`                                                 |
| `actif`                  | boolean            | faux : suspendu, il ne vend plus nulle part                       |
| `cree_a`                 | timestamptz        |                                                                   |

### `agrement_vendeur`

| Colonne                                  | Type        | Remarque                         |
| ---------------------------------------- | ----------- | -------------------------------- |
| `vendeur_id`                             | uuid        | clé étrangère vers `vendeur`     |
| `compagnie_id`                           | uuid        | clé étrangère vers la compagnie  |
| `compagnie_nom`                          | text        | recopié pour l'affichage         |
| `etat`                                   | text        | `actif` ou `retire`              |
| `commission_classique`, `commission_vip` | integer     | 0 à 2 000, 100 et 150 par défaut |
| `accorde_le`, `retire_le`                | timestamptz |                                  |
| `accorde_par`                            | uuid        | la personne de l'agence          |

Clé primaire `(vendeur_id, compagnie_id)` : un agrément retiré est redonné par une mise à jour de la même ligne.
Index sur `compagnie_id` (liste de l'agence).

### `compteur_numero_vendeur`

Une séquence PostgreSQL (`CREATE SEQUENCE numero_vendeur`) : `NumerosVendeurs.prochain()` renvoie `nextval`. Le
numéro est mis en forme `V-` + 4 chiffres au moins.

### `vente_vendeur`

| Colonne                                                                  | Type               | Remarque                                                                                 |
| ------------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| `id`                                                                     | uuid, clé primaire | clé d'idempotence du paiement de l'agence                                                |
| `version`                                                                | integer            | incrémenté à chaque changement d'état                                                    |
| `vendeur_id`                                                             | uuid               | clé étrangère vers `vendeur`                                                             |
| `compagnie_id`, `depart_id`                                              | uuid               |                                                                                          |
| `billet_id`                                                              | uuid, **unique**   | fixé dès la vente ; le billet est émis avec cet identifiant                              |
| `billet_numero`                                                          | text               | rempli à la fin                                                                          |
| `siege`                                                                  | integer            | siège retenu pendant le règlement                                                        |
| `voisin_nom_chiffre`, `voisin_telephone_chiffre`                         | text chiffrés      |                                                                                          |
| `voisin_index`                                                           | text               | index aveugle du téléphone : « mes clients »                                             |
| `empreinte`                                                              | text               | index aveugle (nom normalisé + téléphone) : un voisin n'a pas deux billets sur un départ |
| `origine_code`, `origine_ville`, `destination_code`, `destination_ville` | text               |                                                                                          |
| `classe`                                                                 | text               | `classique` ou `vip`                                                                     |
| `depart_a`                                                               | timestamptz        | heure du départ                                                                          |
| `prix`, `commission`                                                     | integer            | la commission est figée à la vente                                                       |
| `moyen`                                                                  | text               | `mtn_momo` ou `orange_money`                                                             |
| `etat`                                                                   | text               | `en_attente`, `reglee`, `terminee`, `refusee`, `expiree`, `a_rembourser`                 |
| `cree_a`, `expire_a`, `reglee_a`, `terminee_a`, `maj_a`                  | timestamptz        |                                                                                          |
| `reference`                                                              | text               | référence de la transaction de l'opérateur                                               |
| `cause`                                                                  | text               | pourquoi la vente n'a pas abouti                                                         |

Deux index uniques **partiels** portent les garanties du module (`VentesRepository.ajouter` doit les traduire en
résultats `vente_en_cours` et `doublon`) :

```sql
-- une seule vente qui attend son règlement par vendeur
CREATE UNIQUE INDEX vente_vendeur_une_en_attente ON vente_vendeur (vendeur_id) WHERE etat = 'en_attente';
-- un même voisin n'a pas deux billets (vendus ou en route) sur un départ chez un vendeur
CREATE UNIQUE INDEX vente_vendeur_voisin_depart ON vente_vendeur (vendeur_id, depart_id, empreinte)
  WHERE etat IN ('en_attente', 'reglee', 'terminee');
```

Autres index : `(vendeur_id, cree_a)` (bilan, clients), `(etat)` partiel sur `en_attente`, `reglee`, `refusee`,
`expiree` (tâche de fond). `transitionner(id, de[], changement)` est un `UPDATE … WHERE id = $1 AND etat = ANY($2)
RETURNING *` : une ligne ou rien.

### `credit_commission_vendeur`

| Colonne                                  | Type               | Remarque                                                                         |
| ---------------------------------------- | ------------------ | -------------------------------------------------------------------------------- |
| `cle`                                    | text, clé primaire | `commission:<venteId>` : un crédit par vente (`INSERT … ON CONFLICT DO NOTHING`) |
| `vendeur_id`, `compagnie_id`, `vente_id` | uuid               |                                                                                  |
| `montant`                                | integer            | > 0                                                                              |
| `at`                                     | timestamptz        | index `(vendeur_id, at)`                                                         |

### `debit_commission_vendeur`

| Colonne                                     | Type               | Remarque                                    |
| ------------------------------------------- | ------------------ | ------------------------------------------- |
| `cle`                                       | text, clé primaire | `commissions:<vendeurId>:<AAMMJJ du lundi>` |
| `vendeur_id`                                | uuid               |                                             |
| `montant`                                   | integer            |                                             |
| `at`                                        | timestamptz        |                                             |
| `etat`                                      | text               | `en_attente` (réservé) ou `verse`           |
| `operateur`, `telephone_chiffre`, `libelle` | text               | de quoi rejouer le versement                |
| `reference`                                 | text               | référence de l'opérateur une fois versé     |

Le **solde** d'un vendeur est la somme de ses crédits moins celle de ses débits (réservés compris).
`CommissionsVendeurs.reserver` doit être **atomique** : vérifier le solde, refuser un doublon de clé et insérer
le débit dans la même transaction (verrou sur la ligne du vendeur). `annuler` supprime un débit encore
`en_attente` ; `confirmer` le passe à `verse`.

## Ports

| Port                                                                                                      | Rôle                                            | Version fournie                                                  |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `VendeursRepository`, `AgrementsRepository`, `NumerosVendeurs`, `VentesRepository`, `CommissionsVendeurs` | Stockage                                        | mémoire (`durable = false`)                                      |
| `ComptesVendeurs`                                                                                         | Compte et rôle `vendeur`                        | mémoire ; à brancher sur le socle                                |
| `OffreBillets`                                                                                            | Départs, retenue des sièges, émission du billet | `OffreBilletsBilletterie` (billetterie AM-162)                   |
| `ReglementsAgence`                                                                                        | Le vendeur paie l'agence par push MoMo          | `ReglementsAgencePaiements` (paiements AM-165, `payerAuGuichet`) |
| `MessagesVendeurs`                                                                                        | SMS du billet et messages au vendeur            | `MessagesVendeursSms` (SMS AM-166)                               |
| `VersementsMobile`                                                                                        | Versement des commissions                       | celui du module relais                                           |

## Décisions à confirmer

- **Qui finance la commission ?** Le prix du billet va en entier à l'agence ; la commission (100 F / 150 F) est
  versée au vendeur par AfriMove, par un versement à part le lundi, et n'est pas prélevée sur le règlement de
  l'agence. À confirmer avec la finance : prélèvement sur le reversement de l'agence ou facture à l'agence.
- **Paiement par carte refusé** : le règlement de l'agence se fait par MTN MoMo ou Orange Money seulement (le
  contrat accepte `carte`, l'API répond 422 `moyen_indisponible`). Le moyen doit être celui de l'opérateur du
  numéro MoMo du vendeur.
- **Une seule vente en attente à la fois** par vendeur.
- **Client régulier** : 3 billets au moins ; **habitude** : 3 voyages dont les deux tiers le même jour.
- **Versement strictement le lundi** (8 h à minuit, Douala) : une commission gagnée le mardi attend le lundi
  suivant. Une commission gagnée après le versement du lundi attend le lundi d'après. Un versement refusé par
  l'opérateur est retenté le lundi suivant (le montant revient au solde) ; un versement sans réponse est rejoué
  tout de suite par la tâche de fond.
- **Argent arrivé après coup / départ fermé après paiement** : la vente passe à `a_rembourser` et le
  remboursement du vendeur est manuel (aucun remboursement automatique).
- **Pas de route de suspension** d'un vendeur : le champ `vendeur.actif` existe et est respecté partout, mais
  rien ne le modifie (à ajouter dans l'administration AfriMove).
- **Retenue du siège** : 10 minutes côté vente, alors que la billetterie retient un siège 15 minutes ; la
  vente rend le siège dès qu'elle s'arrête.
- **Fenêtre des clients** : 12 mois, 20 clients au plus.
- **Commission de 0 F** : aucun crédit n'est écrit.

## Reste à faire

- Adaptateurs PostgreSQL des cinq ports de stockage et branchement de `ComptesVendeurs` (voir plus haut), puis
  `VendeursModule` dans `AppModule`.
- Écrans (AM-147) : brancher l'écran Vendeur sur l'adaptateur HTTP d'`api-client` à la place du mock
  (`packages/api-client/src/colis/mock/vendeur.ts`) et vérifier. Hors du périmètre de ce ticket (API seule).
- Écran de l'agence pour agréer, lister, fixer les commissions et retirer (routes `/agence/vendeurs` prêtes).
- Suspension d'un vendeur et remboursement des ventes `a_rembourser` dans l'administration AfriMove.
- Test d'intégration PostgreSQL des adaptateurs (contrat des ports, index uniques partiels, concurrence).
- Essai réel avec l'agrégateur MoMo : délais de confirmation du push, comportement des refus.
