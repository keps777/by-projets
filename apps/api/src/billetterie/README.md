# Billetterie (AM-162)

Départs, sièges en temps réel, billets nominatifs à QR signé, scan au quai. Module Nest autonome :
`BilletterieModule`, importé dans `AppModule`. Les tables sont dans `prisma/schema.prisma` ; les
adaptateurs PostgreSQL sont dans `postgres.ts` (`apps/api/INTEGRATION.md`) : catalogue, billets, inventaire,
commandes, scans, événements traités, préférences, numérotation en ligne, puis (lot B, `postgres-annexes.ts`)
`Promotions` (`promotion`), `ProchesVoyageur` (`proche_voyageur`, téléphone chiffré), `ColisDuDepart` (lecture de
`colis`) et `AvisBillets` (`avis_billetterie`, en ajout seul), migration `20261017000800_billetterie_reliquats`.
Restent hors base : `ConversionDevises` et `DiffusionTempsReel` (aucune donnée à perdre) et `SignataireQr`
(la clé `BILLETTERIE_QR_CLE_PRIVEE` est un secret, pas une table). La production ne démarre que si cette clé
est posée.

Les routes suivent les contrats de `packages/contrats` (`voyageur` et `agence`) et les chemins de
`packages/api-client` : le mode HTTP du client d'API fonctionne sans adaptation. Chaque test e2e
relit la réponse avec le schéma zod du contrat.

## Garanties

| Exigence                                   | Comment elle est tenue                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un siège ne se vend pas deux fois en ligne | `Inventaire.occuper` et `Inventaire.bloquer` sont atomiques (index unique `(depart_id, siege)` en base). Vente au guichet, commande en ligne, report et fusion passent tous par là. Tests : 10 ventes simultanées, 12 blocages simultanés, 8 commandes simultanées, paiement tardif après revente.             |
| Un billet scanné deux fois est refusé      | `Billets.transitionner(id, ["paye"], …)` compare l'état à l'écriture : deux appareils qui scannent au même instant, un seul passe, l'autre reçoit `deja_scanne` avec l'heure du premier scan. Test avec lecture ralentie pour forcer la course.                                                                |
| Le QR ne peut pas être forgé               | `AM1:<numéro>:<code>:<départ>:<signature>`, ECDSA P-256 / SHA-256. La clé privée reste sur le serveur ; la clé publique est publiée (`GET /billetterie/cle-publique`) et vérifie un QR **hors ligne**. Un caractère modifié, une signature recollée d'un autre billet, une autre clé : refusé (`introuvable`). |
| Un événement rejoué ne refait rien         | L'UUID de l'événement est la clé d'idempotence. Le rejeu renvoie la même réponse avec `accuse.statut = "deja_recu"`. Des rejeux simultanés sont sérialisés.                                                                                                                                                    |
| Rien d'identifiant en clair                | Nom, téléphone et 4 derniers chiffres de la pièce sont chiffrés (`ChiffrementService`), le téléphone se retrouve par index aveugle ; les réponses mémorisées des événements sont chiffrées aussi.                                                                                                              |

## Routes

Voyageur (`@Roles("voyageur")`) :

| Méthode et chemin                                  | Rôle                                                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /voyageur/departs`                            | Recherche multi-compagnies (`depart`, `arrivee`, `jour`, `classe`, `compagnies`, `preferees`, `covoit`, `matin`, `coteACote`, `prixMax`) |
| `GET /voyageur/departs/filtres`, `PUT` idem        | Écran des filtres ; mémoriser les filtres d'un trajet                                                                                    |
| `PUT /voyageur/compagnies/:id/preferee`            | Compagnie préférée                                                                                                                       |
| `GET /voyageur/departs/:id`                        | Détail d'un départ                                                                                                                       |
| `GET /voyageur/departs/:id/prix?depuis=&vers=`     | Prix partiel au prorata des km, arrondi à 100 F                                                                                          |
| `GET /voyageur/departs/:id/sieges`                 | Plan des sièges (instantané) et `versionPlan`                                                                                            |
| `POST /voyageur/departs/:id/sieges/:siege/blocage` | Blocage de 15 minutes ; 409 `SIEGE_PRIS`                                                                                                 |
| `WS /voyageur/departs/:id/sieges/direct`           | Plan puis changements de siège en temps réel                                                                                             |
| `GET /voyageur/commandes/devis`                    | Billet + 250 F de frais de service ; code promotionnel                                                                                   |
| `POST /voyageur/commandes`, `GET …/:id`            | Commande (sièges retenus 15 minutes)                                                                                                     |
| `GET /voyageur/billets/:id`                        | Billet nominatif, QR, code à 4 chiffres                                                                                                  |
| `GET/POST /voyageur/billets/:id/annulation`        | Aperçu puis annulation (gratuite jusqu'à 60 min avant le départ)                                                                         |
| `POST /voyageur/billets/:id/report`                | Report sur un autre départ de la même ligne, sans frais                                                                                  |

Agence (`@Vente("guichetier")` pour vendre, `@Roles("guichetier", "superviseur")` au quai) :

| Méthode et chemin                    | Événement ou lecture                    |
| ------------------------------------ | --------------------------------------- |
| `GET /agence/vente/contexte`         | Écran de vente                          |
| `POST /agence/billets`               | `billet.vendu`                          |
| `POST /agence/cadence/billets`       | `billet.vendu_cadence`                  |
| `POST /agence/billets/telephone`     | `billet.telephone_ajoute`               |
| `GET /agence/quai/embarquement`      | Écran du quai                           |
| `POST /agence/quai/scans`, `…/codes` | `quai.scanne`, `quai.code_saisi`        |
| `POST /agence/quai/completions`      | `billet.complete`                       |
| `POST /agence/quai/liberations`      | `quai.libere`                           |
| `POST /agence/quai/listes`           | `quai.liste_envoyee` (le bus part)      |
| `WS /agence/quai/:departId/direct`   | Scans et compte des embarqués en direct |

Exploitation (hors contrats de l'agence) :

| Méthode et chemin                      | Rôle                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /billetterie/cle-publique`        | Public. Clé de vérification des QR (JWK) pour les appareils du quai                                                  |
| `POST /agence/departs/:id/transitions` | Superviseur (sa gare) ou patron : ouvrir la vente, embarquer, partir, arriver, annuler, retarder, reprendre la vente |
| `POST /agence/departs/:id/fusion`      | Fusion dans un autre départ de la même ligne, tout ou rien                                                           |

Erreurs : `{ code, message, details? }`. 409 `SIEGE_PRIS`, 422 `PAIEMENT_INVALIDE`, 403
`SUPERVISEUR_REQUIS`, 409 `TRANSITION_INTERDITE`, 404 pour une ressource inconnue, 400
`REQUETE_INVALIDE` pour un corps illisible.

### WebSocket

Les canaux sont servis par le serveur HTTP de l'application (événement `upgrade`, bibliothèque `ws`).
Le jeton d'accès se donne en `Authorization: Bearer` ou, pour un navigateur, en
`?access_token=<jeton>`. **Le client d'API (`api-client`) n'ajoute pas encore le jeton à l'adresse
d'un canal** : à ajouter côté client (hors périmètre de ce ticket) pour que les canaux marchent en
mode HTTP. Plusieurs instances de l'API : remplacer `DiffusionTempsReel` (mémoire) par Redis pub/sub
ou `LISTEN/NOTIFY`.

## Ports et adaptateurs

`ports.ts` déclare des classes abstraites ; `memoire.ts` en donne la version en mémoire (tests,
développement). `BilletterieModule` **refuse de démarrer en production** tant qu'un port est en
mémoire (`durable = false`) ou que `BILLETTERIE_QR_CLE_PRIVEE` manque.

| Port                                                             | À fournir par                           | Remarque                                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Catalogue`                                                      | Intégration (lit les tables ci-dessous) | `changerDepart` : comparer et remplacer sur l'état                                                       |
| `Billets`                                                        | Intégration                             | `transitionner` : comparer et remplacer sur l'état (`UPDATE … WHERE etat = ANY(…)`)                      |
| `Inventaire`                                                     | Intégration                             | Contrainte d'unicité `(depart_id, siege)` ; version du plan incrémentée dans la même transaction         |
| `Commandes`, `Scans`, `EvenementsTraites`, `PreferencesVoyageur` | Intégration                             |                                                                                                          |
| `NumerotationEnLigne`                                            | **AM-161**                              | 4001–9999 par compagnie, gare et jour, sans trou, dans une transaction                                   |
| `Promotions`, `ProchesVoyageur`                                  | Intégration (lot B, PostgreSQL)         | Tables `promotion` (code en majuscules) et `proche_voyageur` (téléphone chiffré)                         |
| `ConversionDevises`                                              | Paiements (AM-165)                      | La version mémoire a des taux indicatifs                                                                 |
| `ColisDuDepart`                                                  | Intégration (lot B, PostgreSQL)         | Colis chargés dans la soute : lecture de la table `colis`                                                |
| `AvisBillets`                                                    | Intégration (lot B, PostgreSQL)         | Garde `billet.emis`, `billet.annule`… dans `avis_billetterie` (ajout seul) ; SMS et paiements à brancher |
| `DiffusionTempsReel`                                             | Intégration                             | Redis ou NOTIFY entre instances                                                                          |
| `SignataireQr`                                                   | Ce module                               | Clé ECDSA P-256 privée (JWK) dans `BILLETTERIE_QR_CLE_PRIVEE`, JSON brut ou en base64                    |

Les paiements appellent `CommandesService.confirmerPaiement(commandeId, moyen)` quand l'agrégateur
confirme : les billets sont émis. Rappelé (webhook renvoyé), il ne crée rien de plus. Si les sièges
ont été repris entre-temps, il lève 409 `SIEGES_PERDUS` : le paiement doit alors être remboursé.

## Tables PostgreSQL attendues

Colonnes nouvelles en gras. Dates : `timestamptz` (affichées en `+01:00`).

- `compagnie` : id, code (3 lettres), nom.
- `gare` : id, compagnie_id, code de ville (`DLA`), nom, ville.
- `guichet` : id, gare_id, rang (1 à 3 : plage de numéros).
- `ligne` : id, compagnie_id, code, gare_origine_id, gare_destination_id, tarifs (classique, vip, bagage), **duree_minutes**.
- `arret` : id, ligne_id, nom, ordre, km_depuis_origine, montee.
- `bus` : id, compagnie_id, immatriculation, capacite, **capacite_soute**, classe.
- `depart` : id, numero, ligne_id, bus_id, classe, heure_depart, etat, historique (jsonb), fusionne_dans_id, **quai**, **chauffeur_id**, **convoyeur_id**.
- `billet` : id, numero, sequence, compagnie_id, gare_id, depart_id, siege, classe, prix, bagage, canal, guichet_id, acheteur_id, commande_id, **passager_chiffre**, **passager_telephone_index**, code_billet, qr, cree_a, etat, historique (jsonb), evenement_id, appareil_id, auteur_id, paiement (jsonb), a_completer_au_quai, sms_envoye, retard_prevenu, embarque_a, reporte_de.
  Index uniques : `numero` ; `evenement_id` ; `(depart_id, code_billet)` partiel `WHERE etat <> 'annule'`.
- `siege_depart` (inventaire) : depart_id, siege, billet_id (null si libre), bloque_par, commande_id, bloque_jusqua. Clé primaire `(depart_id, siege)` ; la version du plan est un compteur par départ (`depart.version_plan`) incrémenté dans la même transaction.
- `commande` : id, voyageur_id, depart_id, type, libelle, lignes (jsonb), total, conversion (jsonb), statut, creee_a, expire_a, sieges (int[]), passagers_chiffre, billet_ids, code_promo, moyen_paiement.
- `scan_quai` : evenement_id (unique), depart_id, billet_id, numero, resultat, at, siege, classe, bagages_soute, premier_scan_a, appareil_id, auteur_id.
- `evenement_traite` : id (unique), type, recu_a, reponse_chiffree (la réponse est rejouée telle quelle).
- `compagnie_preferee` : voyageur_id, compagnie_id. `filtres_voyageur` : voyageur_id, depart, arrivee, filtres (jsonb).

Un job (ou le balayage intégré, toutes les 30 s) appelle `CommandesService.expirerEchues` et
`SiegesService.expirerBlocages`. Avec plusieurs instances, prévoir un verrou (advisory lock) pour
qu'une seule balaie.

## Intégration (coordinateur)

1. Fait : `BilletterieModule` est dans `AppModule`.
2. Fait : les adaptateurs PostgreSQL remplacent les `…Memoire` en production ou avec `API_STOCKAGE=postgres`.
   Lot B : `Promotions`, `ProchesVoyageur`, `ColisDuDepart` et `AvisBillets` aussi (`postgres-annexes.ts`).
3. Générer une clé : `node -e "crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']).then(k=>crypto.subtle.exportKey('jwk',k.privateKey)).then(j=>console.log(JSON.stringify(j)))"`
   et la poser dans `BILLETTERIE_QR_CLE_PRIVEE` (secret, jamais dans le dépôt).
4. Faire consommer les avis gardés par `AvisBillets` (table `avis_billetterie`) par la passerelle SMS et les
   paiements : le port les enregistre, rien ne les envoie encore.
5. Faire poser le jeton d'accès à `api-client` pour les canaux WebSocket.

## Tests

`pnpm --filter @afrimove/api test` : règles et parité avec `@afrimove/domain`, QR (falsification),
lecteurs comparés aux schémas zod, inventaire, et e2e Nest (gardes réelles, adaptateurs en mémoire)
pour le voyageur, l'agence, l'exploitation et le temps réel. `testing/app-billetterie-test.ts`
monte l'API avec deux compagnies, la ligne Douala–Yaoundé de chacune et des départs.

## Décisions à confirmer et limites

- **Départ du bus** : `quai.liste_envoyee` fait partir le bus (le départ passe à `parti`, les payés
  non montés deviennent `non_presente`). Si le départ doit se déclencher autrement, c'est
  `DepartsService.appliquer`.
- **Billet non présenté scanné** : le quai répond `annule` (le contrat n'a pas de résultat dédié).
- **Retenue d'annulation** : 25 % classique, 50 % VIP après le délai de 60 minutes (valeurs
  provisoires du domaine, à confirmer par le patron).
- **Annulation d'une vente d'agent** : refusée au voyageur (409 `SUPERVISEUR_REQUIS`) ; côté agence
  `BilletsService.annuler` exige `validePar` (PIN du superviseur) ; l'événement
  `annulation.demandee`/`decidee` n'est pas traité ici.
- **Équipage** : `GET /agence/quai/embarquement` répond 409 `EQUIPAGE_INCOMPLET` tant que bus,
  chauffeur, convoyeur et quai ne sont pas affectés ; `quai.liste_envoyee` exige un chauffeur.
- **Numéros du guichet** : le numéro d'un événement doit être dans la plage du rang du guichet de
  l'agent ; le contrôle d'unicité et l'absence de trou relèvent d'AM-161.
- **Non couvert** : lectures de la cadence (`agence.cadence.*`), `route.*` (convoyeur) et covoiturage.
  Taux de change : indicatifs seulement.
