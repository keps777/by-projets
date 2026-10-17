# Suivi GPS en temps réel (AM-170)

Le téléphone du chauffeur ou du convoyeur envoie la position du bus toutes les 30 s ; celui du
livreur moto envoie la sienne pendant la livraison. Le module en tire l'avancée du bus sur sa ligne,
l'heure d'arrivée estimée, le retard, les arrêts passés, l'alerte d'arrêt anormal (bus arrêté plus de
10 min hors arrêt, par exemple après Edéa) et le SMS au proche 15 min avant l'arrivée. Module Nest
autonome : `GpsModule`, à importer dans `AppModule` par le coordinateur.

Les réponses suivent les contrats de `packages/contrats` (`voyageur`, `colis`, `patron`) et les
chemins de `packages/api-client` : chaque test e2e relit la réponse avec le schéma zod du contrat.
Les corps reçus (positions, « prévenir un proche ») sont lus par de petits lecteurs
(`validation.ts`, `schemas.ts`) comparés aux schémas zod par `contrats.test.ts`.

## Garanties

| Exigence                                        | Comment elle est tenue                                                                                                                                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Position mise à jour toutes les 30 s            | `REGLES_GPS.periodeEnvoiSecondes` ; chaque lot reçu fait avancer l'état et diffuse la dernière position (WebSocket voyageur et salle de contrôle). Sans position depuis 2 minutes (4 envois manqués), `enDirect` passe à `false`.                                 |
| Alerte si un bus est arrêté plus de 10 min      | Un point d'ancrage suit l'immobilité (vitesse sous 3 km/h, rayon de 150 m pour absorber la dérive du GPS). À 10 min, loin de tout arrêt de la ligne (500 m), une alerte s'ouvre : une seule par départ (index unique partiel), fermée quand le bus repart.        |
| Un lot renvoyé ne change rien                   | Clé d'une position : (sujet, auteur, instant). L'état ignore toute position plus ancienne que la dernière retenue ; le chauffeur et le convoyeur peuvent envoyer en même temps.                                                                                   |
| Le bus ne recule pas, une mauvaise position non | La progression sur la ligne ne baisse jamais ; une position à plus de 10 km de la ligne ou d'une précision au-delà de 500 m est gardée mais ne sert pas aux calculs ; une position datée du futur (+2 min) ou de plus de 24 h est refusée, une à une.             |
| Deux appareils, un seul état                    | `EtatsSuivi.ecrire` compare la version (comparer-et-remplacer), 6 essais ; au-delà, 409 `SUIVI_OCCUPE`.                                                                                                                                                           |
| Un SMS au proche ne part pas deux fois          | Le SMS est envoyé avec une clé d'idempotence (`gps:proche:<billet>:<proche>`), puis marqué envoyé. Si la marque échoue, le renvoi porte la même clé. Un échec d'envoi ne perd pas la position : le SMS repart à la position suivante.                             |
| Une panne entre deux écritures se répare        | L'état annonce l'alerte (`alerteId`) avant qu'elle soit écrite ; à la position suivante `rattraper` l'écrit si elle manque (ouverture idempotente).                                                                                                               |
| On ne suit que son propre bus                   | Billet : seul le voyageur qui l'a acheté ; les autres reçoivent 404 `BILLET_INCONNU`. Positions : seul l'équipage du départ, de sa compagnie. Livraison : le livreur de la mission envoie ; l'expéditeur et le destinataire reçoivent le temps restant seulement. |

## Routes

Appareils (`@Roles("chauffeur", "convoyeur")`, `@Roles("livreur")`) :

| Méthode et chemin                         | Rôle                                                                                                                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /gps/bus/:departId/positions`       | Lot de 1 à 100 positions `{ instant, latitude, longitude, precisionM?, vitesseKmh? }`. Réponse `{ acceptees, doublons, rejetees, serveurA }`. 409 `DEPART_NON_EN_ROUTE` hors embarquement et route. |
| `GET /gps/bus/:departId`                  | Équipage, superviseur, patron : dernière position, vitesse, prochain arrêt, retard, alerte (feuille de route du chauffeur).                                                                         |
| `POST /gps/livraisons/:colisId/positions` | Livreur de la mission en cours (404 `MISSION_INCONNUE` pour un autre, 409 `MISSION_TERMINEE`).                                                                                                      |

Voyageur (`@Roles("voyageur")`, chemins de `api-client/src/voyageur/operationsServices.ts`) :

| Méthode et chemin                                        | Rôle                                                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET /voyageur/billets/:id/direct`                       | « Mon bus en direct » : arrivée prévue et estimée, retard, étapes, proche proposé (`SchemaSuiviBus`)                   |
| `PUT /voyageur/billets/:id/prevenir`                     | Prévenir un proche : `{ procheId, minutesAvantArrivee? }` (15 par défaut, 1 à 120). Un seul proche actif par billet.   |
| `DELETE /voyageur/billets/:id/prevenir/:procheId`        | Ne plus prévenir (tant que le SMS n'est pas parti)                                                                     |
| `GET /voyageur/monter-en-route?arretId=` ou `?lat=&lng=` | Les bus qui passent à l'arrêt dans les 4 h, avec heure de passage estimée d'après leur position, places libres et prix |
| `WS /voyageur/billets/:id/direct/position`               | Position du bus du billet à chaque envoi (message `SchemaMessagePositionBus`), dernière position à la connexion        |

Salle de contrôle (`@Roles("patron", "superviseur")`) et livraison :

| Méthode et chemin                | Rôle                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /patron/controle/bus`       | `{ instant, busEnRoute, bus[], alerte, aTraiter[] }` ; `alerte` et `aTraiter` ont la forme de `patron.SalleDeControle`              |
| `WS /patron/controle/bus/direct` | Les bus à la connexion, puis `bus`, `a_traiter` (alerte d'arrêt) et `alerte_resolue`                                                |
| `WS /colis/:id/livraison/direct` | Expéditeur et destinataire : temps restant et heure d'arrivée du livreur (`colis.SchemaPositionLivreur`), jamais sa position exacte |

`/patron/controle` et `/patron/controle/direct` (écran complet de la salle de contrôle) et
`/agence/bus/chauffeur` (feuille de route) appartiennent aux modules patron et agence : le module
GPS leur fournit les bus, l'alerte et la position par `ControleBusService` et `SuiviBusService`
(exportés).

Erreurs : `{ code, message, details? }`. 400 `REQUETE_INVALIDE` (corps ou paramètres), 401 sans jeton,
403 `EQUIPAGE_REQUIS` / `COMPAGNIE_REQUISE`, 404 `DEPART_INCONNU`, `BILLET_INCONNU`, `ARRET_INCONNU`,
`PROCHE_INCONNU`, `PREVENIR_INCONNU`, `COLIS_INCONNU`, `MISSION_INCONNUE`, 409 `DEPART_NON_EN_ROUTE`,
`BILLET_ANNULE`, `BUS_NON_AFFECTE`, `TRAJET_TERMINE`, `MISSION_TERMINEE`, `LIVRAISON_TERMINEE`,
`SUIVI_OCCUPE`.

### WebSocket

Les canaux sont servis par le serveur HTTP de l'application (événement `upgrade`, bibliothèque `ws`),
comme ceux de la billetterie ; les adresses d'un autre module sont laissées à son écouteur. Le jeton
d'accès se donne en `Authorization: Bearer` ou, pour un navigateur, en `?access_token=<jeton>`. Le
rôle est vérifié avant l'accès au billet. Pings toutes les 30 s, connexions mortes fermées. **Le
client d'API n'ajoute pas encore le jeton à l'adresse d'un canal** (hors périmètre, voir
`billetterie/README.md`). Plusieurs instances : remplacer `DiffusionGps` (mémoire) par Redis pub/sub
ou `LISTEN/NOTIFY`.

## Règles métier (`regles.ts`, fonctions pures)

Tous les seuils sont dans `REGLES_GPS`. Ceux du ticket : envoi toutes les 30 s, alerte à 10 min,
SMS 15 min avant l'arrivée. Les autres sont des réglages à confirmer (voir plus bas).

- **Horaire prévu** : durée du trajet moins les arrêts prévus = temps de conduite, réparti selon les
  kilomètres ; chaque arrêt intermédiaire ajoute sa durée.
- **Estimation** : le bus est supposé tenir l'horaire à partir de l'écart qu'il a maintenant. Un bus
  arrêté voit son retard grandir à chaque position ; dans la zone d'un arrêt, l'écart est borné par
  la durée d'arrêt prévue (une pause normale n'est pas un retard). Un bus pas encore parti n'arrive
  pas en avance. Sans position : l'horaire prévu, avec le retard de départ connu.
- **Livreur moto** : trajet restant à vol d'oiseau × 1,3 (détour urbain), à la vitesse moyenne récente
  bornée entre 12 et 40 km/h (20 km/h à défaut) ; passe d'abord au point de retrait si le colis n'est
  pas retiré.
- **Monter en route** : un bus n'est proposé que s'il prend des voyageurs à cet arrêt, n'y est pas
  déjà passé, passe dans les 4 h et a des places libres.

## Ports et adaptateurs

`ports.ts` déclare des classes abstraites ; `memoire.ts` en donne la version en mémoire (tests,
développement). `GpsModule` **refuse de démarrer en production** tant qu'un port est en mémoire
(`durable = false`).

| Port                                                         | À fournir par                                          | Remarque                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReseauTransport`                                            | Intégration (lit `depart`, `ligne`, `arret`, `bus`)    | Départs avec arrêts **et coordonnées** (voir tables), `trajetsEnRoute(compagnie)`, `trajetsPres(point, rayon)`                                                                        |
| `BilletsSuivis`                                              | Billetterie (AM-162)                                   | Billet, acheteur, validité                                                                                                                                                            |
| `ProchesASuivre`                                             | Comptes (AM-013) / `ProchesVoyageur` de la billetterie | Proche d'un voyageur et proche proposé par défaut                                                                                                                                     |
| `MissionsSuivies`                                            | Colis (AM-163)                                         | Mission du livreur, points de retrait et de remise                                                                                                                                    |
| `OffresDeMontee`                                             | Billetterie                                            | Places libres à l'arrêt et prix au prorata                                                                                                                                            |
| `Positions`, `EtatsSuivi`, `AlertesArret`, `PrevenirProches` | **Ce module** (PostgreSQL)                             | `ajouter` : clé (sujet, auteur, instant) ; `ecrire` : comparer la version ; `ouvrir` : index unique partiel                                                                           |
| `AvisSuivi`                                                  | SMS (AM-166), notifications                            | `prevenirProche` : gabarit `alerte_proche` (`voyageur`, `gare`, `arriveeA`, `compagnie`), `cle` = clé d'idempotence ; `alerteArret` : SMS ou notification au superviseur et au patron |
| `DiffusionGps`                                               | Intégration                                            | Redis ou NOTIFY entre instances                                                                                                                                                       |

## Tables PostgreSQL attendues

Dates en `timestamptz` (affichées en `+01:00`). Les tables lues existent déjà dans
`prisma/schema.prisma` (`depart`, `ligne`, `arret`, `bus`, `billet`, `colis`, `personne`).

**Manque dans le schéma, pour `ReseauTransport`** : `arret` n'a ni `latitude` ni `longitude`
(`double precision`, obligatoires pour le suivi), ni durée d'arrêt (`arret_minutes`, entier, nul si le
bus ne s'y arrête pas longtemps), ni `point_de_montee` (texte saisi par la compagnie). `gare` doit
donner un nom d'arrivée (« Mvan »). `depart` doit porter l'heure réelle de départ (`parti_a`) : à
défaut, l'historique JSON de l'état.

Tables écrites par le module :

- `position_gps` : `sujet` (`bus:<departId>` ou `livraison:<colisId>`), `auteur_id`, `instant`,
  `latitude`, `longitude`, `precision_m` (nul), `vitesse_kmh` (nul), `recu_a`. Clé primaire
  `(sujet, auteur_id, instant)`. Index `(sujet, instant DESC)` pour `recentes` et `derniere`. Volume :
  2 lignes par minute et par bus ; prévoir une purge (par exemple 90 jours) ou un partitionnement par
  mois.
- `suivi_depart` : `depart_id` (clé primaire), `version`, `derniere_instant`, `derniere_latitude`,
  `derniere_longitude`, `derniere_vitesse_kmh`, `progression_km`, `passages` (jsonb, arrêt → instant),
  `immobile_depuis`, `immobile_latitude`, `immobile_longitude`, `alerte_id` (nul). Écriture :
  `UPDATE … SET … WHERE depart_id = $1 AND version = $2 - 1`, `INSERT … ON CONFLICT DO NOTHING` pour
  la version 1 ; zéro ligne touchée = `false`.
- `alerte_arret` : `id`, `depart_id`, `compagnie_id`, `immatriculation`, `apres`, `arret_depuis`,
  `ouverte_a`, `latitude`, `longitude`, `soupcon` (`panne`, `retard`, `autre`), `a_bord` (nul),
  `resolue_a` (nul). **Index unique partiel** `(depart_id) WHERE resolue_a IS NULL` : une seule alerte
  ouverte par départ. Index `(compagnie_id) WHERE resolue_a IS NULL` pour la salle de contrôle.
- `prevenir_proche` : `billet_id`, `proche_id`, `voyageur_id`, `depart_id`, `minutes_avant_arrivee`,
  `actif`, `cree_a`, `envoye_a` (nul). Clé primaire `(billet_id, proche_id)`. Index
  `(depart_id) WHERE actif AND envoye_a IS NULL`. `marquerEnvoye` :
  `UPDATE … SET envoye_a = $1 WHERE … AND envoye_a IS NULL`.

## Intégration (coordinateur)

1. Importer `GpsModule` dans `AppModule` ; les routes `/gps/*`, `/voyageur/…` et `/patron/controle/bus`
   ne se heurtent à aucune route des autres modules.
2. Ajouter à `prisma/schema.prisma` les colonnes de `arret` et les quatre tables ci-dessus, puis écrire
   les adaptateurs PostgreSQL de `Positions`, `EtatsSuivi`, `AlertesArret`, `PrevenirProches`.
3. Brancher `ReseauTransport`, `BilletsSuivis`, `ProchesASuivre`, `MissionsSuivies`, `OffresDeMontee`
   sur les modules billetterie, colis et comptes.
4. Brancher `AvisSuivi` sur la passerelle SMS (AM-166).
5. Faire poser le jeton d'accès à `api-client` pour les canaux WebSocket (voir billetterie).
6. Les écrans (Direct, Arrêt, Chauffeur, Livraison, Contrôle) passent à l'adaptateur HTTP du client
   d'API sans changement de contrat ; les envois de positions (`POST /gps/…/positions`) n'ont pas
   encore d'opération dans `api-client` ni de schéma dans `packages/contrats` (leurs formes sont
   définies dans `schemas.ts`).

## Tests

`pnpm --filter @afrimove/api test` : règles pures (horaire, estimation, immobilité, livreur), géométrie,
lecteurs comparés aux schémas zod, e2e Nest (gardes réelles, adaptateurs en mémoire) pour les
positions, « Mon bus en direct », prévenir un proche, l'alerte d'arrêt et la salle de contrôle,
monter en route, le livreur, et les canaux WebSocket (vrais sockets). `testing/app-gps-test.ts`
monte l'API avec deux compagnies, la ligne Douala – Yaoundé (Edéa, Pouma, Makak…) et ses départs.

## Décisions à confirmer et limites

- **Seuils de réglage** (hors ticket) : immobilité sous 3 km/h dans 150 m, « hors arrêt » à plus de
  500 m d'un arrêt de la ligne, signal perdu après 2 minutes, positions de plus de 500 m
  d'imprécision écartées, 4 h de fenêtre pour « monter en route », livreur à 20 km/h (12 à 40) avec
  détour de 1,3. Tous dans `REGLES_GPS`.
- **L'alerte naît d'une position** : un bus dont le téléphone n'envoie plus rien (batterie, zone sans
  réseau) n'ouvre pas d'alerte ; seul `enDirect = false` le signale. Un balayage « signal perdu » reste
  à décider avec le patron.
- **Soupçon** de l'alerte (`panne`, `retard`, `autre`) : toujours `autre` ; aucune règle ne distingue
  une panne d'une pause longue.
- **Un seul proche par billet** : activer un autre proche désactive le premier tant que son SMS n'est
  pas parti (l'écran n'en montre qu'un).
- **SMS si le bus est déjà dans la fenêtre** : activé à 10 minutes de l'arrivée avec 15 par défaut, le
  SMS part tout de suite.
- **Retard** : jamais négatif (un bus en avance affiche 0) ; l'arrivée estimée n'est jamais avant la
  dernière position.
- **Livreur** : la position exacte n'est jamais diffusée à l'expéditeur ni au destinataire, seulement
  le temps restant (à confirmer côté produit).
- **Non couvert** : `POST /voyageur/monter-en-route/commandes` (achat, billetterie) ; opération
  `api-client` des envois de positions ; mode hors ligne du chauffeur (le lot de 100 positions le
  permet côté serveur).
