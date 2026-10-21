# Analyses du patron (AM-109)

Module Nest `AnalysesModule` : les chiffres que le patron lit dans les écrans **Analyses** (synthèse, une ligne,
un bus) et sur lesquels l'**assistant** (`../assistant/README.md`) s'appuie : agrégats (recette, remplissage, par
ligne, bus, jour, heure, période), règles de détection (fuites d'argent, creux, concurrent moins cher) et
simulation d'horaire et de prix d'un départ.

Le module est dans `AppModule`. Il **n'écrit rien** : il lit, par des **ports** (classes abstraites, `ports.ts`),
ce que la billetterie, les colis, la caisse et la flotte ont écrit. Chaque port a une version **en mémoire**
(`memoire.ts`) et une version **PostgreSQL** (`postgres.ts`), choisies par `API_STOCKAGE` (`postgres` ou
`memoire` ; PostgreSQL par défaut en production, voir `socle/db/stockage.ts`).

## Intégration (faite)

1. `AnalysesModule` est dans les `imports` de `AppModule` (un seul : le module est **global**, `@Global()`,
   `AnalysesService` et les ports sont visibles de l'assistant sans second import ; un deuxième `AnalysesModule`
   aurait ses propres ports, donc ses propres données).
2. Les cinq adaptateurs PostgreSQL existent (`ReferentielAnalysesPrisma`, `FaitsDepartsPrisma`,
   `FaitsCaissePrisma`, `OffresPubliquesPrisma`, `ReseauAnonymePrisma`) et passent, sur de vraies lignes, les
   mêmes scénarios que les versions en mémoire (`postgres.integration.test.ts`, conditionné par
   `DATABASE_URL_TEST`).
3. Le module **n'a pas de table de résultats**, mais lit quatre petites tables de faits d'exploitation que
   personne n'écrivait encore, créées par la migration `20261017000900_lot_c_comptable_analyses_assistant`
   (bloc « lot C » de `prisma/schema.prisma`) : `bus_fiche` (modèle, année, chauffeur habituel, entretien),
   `depart_observation` (note, retard), `depart_incident` (panne ou autre) et `depart_depense` (carburant,
   panne, autre). **Rien ne les alimente encore** (les écrans de saisie n'existent pas) : sans fiche, le modèle
   d'un bus est vide et son année vaut 0 ; sans incident ni dépense, les règles de pannes et de coûts ne
   détectent rien.
4. `VerificationAnalyses` **refuse de démarrer en production** tant qu'un port est en mémoire
   (`durable === false`) et nomme les ports concernés ; avec les adaptateurs PostgreSQL, tous sont durables.

## Routes

Noms d'opérations et schémas de `@afrimove/contrats` (`patron/analyses`) et de `@afrimove/api-client`
(`patron/operations.ts`). Toutes sont réservées au patron (`@Roles("patron")`), sans cache (`no-store`), et ne
rendent que les chiffres de la compagnie du jeton (403 `HORS_PERIMETRE` pour un compte sans compagnie).

| Route                                           | Opération                  | Remarque                                         |
| ----------------------------------------------- | -------------------------- | ------------------------------------------------ |
| `GET /patron/analyses?periode=`                 | `patron.analyses.synthese` | `semaine` (défaut), `mois`, `trimestre`, `annee` |
| `GET /patron/analyses/lignes/:ligneId?periode=` | `patron.analyses.ligne`    | 404 `LIGNE_INCONNUE` hors de la compagnie        |
| `GET /patron/analyses/bus/:busId`               | `patron.analyses.bus`      | 404 `BUS_INCONNU` ; pas de paramètre de période  |

Erreurs au format `{ statusCode, code, message }` : 400 `REQUETE_INVALIDE` (période ou paramètre inconnu),
503 `SOURCE_INDISPONIBLE` (un port ne répond pas : jamais de chiffres inventés).

La période **se termine hier** (jamais un jour entamé) et se compare à la période d'avant, de même longueur.
Tous les jours et heures sont ceux de Douala (+01:00).

## Règles appliquées

| Règle                   | Seuil                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fenêtre des fuites      | 10 jours                                                                                                                                                                           |
| `ecarts_repetes_agent`  | au moins 3 écarts de caisse négatifs d'un même agent, caisses **validées** seulement ; « toujours le mardi » si 2/3 tombent le même jour ; « petite mais régulière » sous 20 000 F |
| `pannes_repetees`       | au moins 2 pannes d'un même bus dans la fenêtre : bus « à surveiller »                                                                                                             |
| `cadence_sans_nom`      | au moins 5 billets de cadence sans numéro de téléphone                                                                                                                             |
| `concurrent_moins_cher` | un départ remplit au moins 10 points de moins que sa ligne, et un concurrent publie un créneau proche moins cher au moins 15 jours de la fenêtre                                   |
| `creux_jour`            | un jour de la semaine sous 70 % du remplissage moyen de la ligne, observé au moins 3 fois ; la veille est « presque pleine » dès 90 %                                              |
| Cible de remplissage    | 85 % (à confirmer : une valeur par agence ?)                                                                                                                                       |
| Simulation              | fenêtre de 30 jours, au moins 5 départs, 30 min minimum entre deux départs d'une ligne, élasticité du prix −0,8                                                                    |

**Anonymat** : les ventes d'une autre compagnie ne sortent jamais. Un concurrent n'est visible que par son
horaire et son prix publics (ce que la recherche du voyageur affiche) ; son nom se règle par
`ANALYSES_NOMMER_CONCURRENTS`. Les moyennes du réseau ne sortent que si au moins 3 autres compagnies les
composent (`seuilAnonymat`, jamais en dessous de 3) ; l'adaptateur filtre dans la requête et le service
**revérifie**.

**Simulation** : repose sur les 30 derniers jours de la ligne. Un départ placé 15 min avant un concurrent récupère
90 % des clients que l'on manque ; sans concurrent à devancer, 25 %. Une baisse de prix suppose une demande
peu élastique (−0,8) pour ne jamais conseiller de baisser un prix sur une hypothèse optimiste. Erreurs : 404
`DEPART_INTROUVABLE`, 422 `HORAIRE_EN_CONFLIT`, `DONNEES_INSUFFISANTES`, `SIMULATION_SANS_EFFET`.

## Variables d'environnement

| Variable                      | Défaut | Rôle                                                                                                      |
| ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `ANALYSES_NOMMER_CONCURRENTS` | `true` | citer le nom d'un concurrent à côté de son horaire et de son prix publics ; sinon « Une autre compagnie » |
| `ANALYSES_SEUIL_ANONYMAT`     | `3`    | compagnies minimum derrière une moyenne du réseau (au moins 3)                                            |

Une valeur invalide fait échouer le démarrage avec toutes les erreurs d'un coup.

## Requêtes PostgreSQL

Le module n'a pas de table de résultats. La description ci-dessous est celle de la conception ; les noms réels
sont ceux du schéma Prisma (colonnes en camelCase : `compagnieId`, `heureDepart`…) et les requêtes sont dans
`postgres.ts`. Tables lues : `ligne`, `bus`, `bus_fiche`, `personne`, `gare`, `depart`, `depart_observation`,
`depart_incident`, `depart_depense`, `billet`, `colis`, `session_caisse`, `compagnie` (les offres des autres
compagnies sont les départs publiés dans `depart`). Tous les ports reçoivent la compagnie du patron : **chaque
requête filtre sur `compagnieId`**, sauf les deux qui regardent hors de la compagnie. Les jours sont ceux de
Douala (`(heure AT TIME ZONE 'UTC') + interval '1 hour'`).

Choix d'interprétation des adaptateurs (à confirmer) :

- la recette d'un billet est `prix + bagage` ; un billet `annule` ou `reporte` ne compte ni dans le remplissage
  ni dans la recette ;
- les moyennes du réseau (`ReseauAnonyme`) comptent aussi les compagnies désactivées : ce sont des ventes
  réelles, et l'anonymat repose sur le nombre de compagnies, pas sur leur état ;
- `arretsEnRoute` est vide (aucune table ne les enregistre) et `enRouteTousEnregistres` vaut vrai.

- **`ReferentielAnalyses`** : `ligne` (id, nom « Douala → Bafoussam », code `DLABAF`, origine, destination),
  `bus` (immatriculation, modèle, capacité, année, chauffeur habituel, entretien à prévoir), `personne` des
  agents (id, nom), `gare` (id, nom, ville), le tout filtré sur la compagnie.
- **`FaitsDeparts.entre(compagnieId, du, au)`** : un fait par départ du jour `[du, au]`, annulés compris. Une
  requête avec jointures agrégées, **jamais une requête par départ** :
  `depart` ⟕ `COUNT(billet) FILTER (WHERE statut = 'valide')`, `SUM(prix)`, billets en ligne
  (`canal IN ('app','whatsapp','ussd')`) et en route (`canal = 'convoyeur'`, arrêts distincts), `colis`
  (nombre et recette), `incident`, `depense` (carburant, panne, autres). Index conseillés :
  `depart (compagnie_id, jour)`, `billet (depart_id)`. L'entrée « enRouteTousEnregistres » vaut faux tant
  qu'un billet vendu en route n'a pas été saisi.
- **`FaitsCaisse.ecarts`** : sessions `session_caisse` clôturées (`ecart = compte - attendu`, tolérance à
  l'ouverture, `validee`) dont le jour tombe dans `[du, au]`. **`ventesCadence`** : billets vendus en mode
  cadence par agent et par départ, dont ceux sans téléphone (`telephone_voyageur IS NULL`).
- **`OffresPubliques.entre(compagnieId, ligneCodes, du, au)`** : les départs **publiés** par les autres compagnies
  sur ces lignes (`compagnie_id <> $1`) : nom de compagnie, code de ligne, jour, heure, prix. Rien d'autre
  (ni billets, ni recette, ni remplissage).
- **`ReseauAnonyme.moyennes(...)`** : par ligne et créneau d'une heure,
  `AVG(remplissage)` des autres compagnies avec `HAVING COUNT(DISTINCT compagnie_id) >= $seuil`. Aucun nom ni
  identifiant dans le résultat.

## Décisions à confirmer

- Seuils des règles ci-dessus (10 jours, 3 écarts, 5 billets, 10 points, 15 jours, 70 %, 90 %) : repris de la
  planche et du bon sens, à valider avec un patron.
- Cible de remplissage unique de 85 % ; fenêtre d'analyse de 30 jours.
- Élasticité du prix de −0,8 (prudente) ; taux de récupération de 90 % et 25 % : hypothèses, pas des mesures.
- Nommer ou non les concurrents (public mais sensible commercialement).
- Seul le seuil de 3 compagnies protège l'anonymat des moyennes du réseau : à relever si le réseau est petit.

## Reste à faire

- Écrans (ou import) qui alimentent `bus_fiche`, `depart_observation`, `depart_incident` et `depart_depense`.
- Test de charge des adaptateurs PostgreSQL sur de vraies données (index ajoutés par la migration :
  `billet (compagnieId, creeA)` et `colis (compagnieId, creeA)`).
- Graphique de 14 jours de l'écran « Réponse de l'assistant » : absent du contrat `@afrimove/contrats`, non ajouté.
- Mise en cache courte des agrégats si la lecture de 30 jours devient lente (aujourd'hui : une lecture par écran).
