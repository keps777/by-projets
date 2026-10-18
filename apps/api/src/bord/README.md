# Le bord : convoyeur, chauffeur, contrôleur (écart A3 de la recette, lot Dc)

Module Nest `BordModule` : ce que font les trois équipiers du bus pendant le trajet.

- le **convoyeur** voit sa feuille (scans, places libres, ventes en route, colis à décharger), vend une place en
  route (numéro de la plage du bord 3001–3999) et scanne les voyageurs qui montent à un arrêt ;
- le **chauffeur** voit sa feuille de route (trajet, dépenses, incidents, semaine), ajoute une dépense avec son
  justificatif, signale un incident (la gare et les voyageurs sont prévenus), annonce un retard (un SMS part à
  tous les voyageurs à bord) et note l'arrivée à un arrêt ;
- le **contrôleur** ouvre un contrôle inopiné, constate les sièges, régularise un voyageur sans billet, signale le
  convoyeur et clôt le contrôle (le constat part au patron).

Le module emprunte les départs, billets, sièges et colis du départ à la billetterie, la position du bus au suivi
GPS, le SMS à la passerelle SMS. Il ne les recopie pas. Les écritures du bord ont leurs ports (classes
abstraites, `ports.ts`) avec une version **en mémoire** (`memoire.ts`) et une version **PostgreSQL**
(`postgres.ts`), choisies par `API_STOCKAGE` (`socle/db/stockage.ts`). En production, `VerificationPortsBord`
**refuse de démarrer** tant qu'un des six ports est en mémoire.

## Routes

Chemins et noms d'opérations de `packages/api-client/src/agence/operations.ts`. Les écritures sont des événements
de l'agence envoyés tels quels : l'UUID de l'événement est la clé d'idempotence (un événement rejoué renvoie la
même réponse avec `accuse.statut = "deja_recu"` et ne refait rien ; un événement refusé n'est pas mémorisé).
L'auteur doit être le compte connecté. Chaque réponse est validée avec le schéma zod du contrat dans les tests.

| Route                                   | Rôle       | Événement / contrat                                    |
| --------------------------------------- | ---------- | ------------------------------------------------------ |
| `GET /agence/bus/convoyeur`             | convoyeur  | `SchemaConvoyeurEtat` (`?departId=` facultatif)        |
| `POST /agence/bus/ventes`               | convoyeur  | `route.billet_vendu`, `SchemaResultatVenteRoute`       |
| `POST /agence/bus/scans`                | convoyeur  | `route.scanne`, `SchemaResultatScanRoute`              |
| `GET /agence/bus/chauffeur`             | chauffeur  | `SchemaChauffeurFeuille` (`?departId=` facultatif)     |
| `POST /agence/bus/depenses`             | chauffeur  | `chauffeur.depense`, `SchemaResultatDepense`           |
| `POST /agence/bus/incidents`            | chauffeur  | `chauffeur.incident`, `SchemaResultatPrevenus`         |
| `POST /agence/bus/retards`              | chauffeur  | `chauffeur.retard`, `SchemaResultatPrevenus`           |
| `POST /agence/bus/arrivees`             | chauffeur  | `chauffeur.arrivee_arret`, `SchemaResultatSimple`      |
| `GET /agence/controle/inopine`          | contrôleur | `SchemaControleInopine` (`?controleId=`, `?departId=`) |
| `POST /agence/controle/sieges`          | contrôleur | `controle.siege_verifie`, `SchemaResultatControle`     |
| `POST /agence/controle/regularisations` | contrôleur | `controle.regularise`, `SchemaResultatRegularisation`  |
| `POST /agence/controle/signalements`    | contrôleur | `controle.convoyeur_signale`, `SchemaResultatControle` |
| `POST /agence/controle/clotures`        | contrôleur | `controle.cloture`, `SchemaResultatControle`           |

`POST /agence/bus/dechargements` (`route.colis_decharges`) est servie par le module colis.

Le contrat n'est pas modifié. `?departId=` des deux feuilles est déjà dans `ParamsDepartBord` et `?controleId=` dans
`ParamsControleInopine`. Seul `?departId=` de `GET /agence/controle/inopine` va au-delà du contrat (il choisit le bus
sur lequel s'ouvre le contrôle ; sans lui, le bus en route le plus récent de la compagnie).

Codes d'erreur (corps `{ code, message, details }`) : 403 `AUTRE_EQUIPAGE` (pas le convoyeur/chauffeur de ce
départ), `AUTEUR_INCOHERENT` ; 404 `AUCUN_DEPART`, `DEPART_INCONNU`, `BILLET_INCONNU`, `CONTROLE_INCONNU`,
`SIEGE_INCONNU` ; 409 `DEPART_HORS_ROUTE`, `SIEGE_PRIS`, `AUTRE_DEPART`, `BILLET_ANNULE`, `CONTROLE_CLOS`,
`DEPENSE_EXISTANTE`, `EQUIPAGE_INCOMPLET` ; 422 `NUMERO_HORS_PLAGE`, `PRIX_INCOHERENT`, `PAIEMENT_INVALIDE`,
`ARRET_INCONNU`, `ARRETS_INVALIDES`, `IDENTIFIANT_INVALIDE`, `CONVOYEUR_INCOHERENT`, `DEPART_INCOHERENT` ;
400 `REQUETE_INVALIDE` (corps qui n'a pas la forme du contrat).

## Règles

- **Vente en route** : le départ est à l'embarquement ou en route, le convoyeur est celui du départ, le trajet
  est entre deux arrêts de la ligne dans l'ordre (on monte à un arrêt de montée), le prix est le prorata des
  kilomètres arrondi à 100 F (règle de la billetterie), le numéro est dans 3001–3999. Le billet naît « payé »
  puis passe tout de suite à « embarqué » (le voyageur est déjà dans le bus), canal `convoyeur`. Le SMS du billet
  part s'il y a un numéro ; une panne de SMS n'empêche pas la vente (`smsEnvoye: false`).
- **Scan** : le QR est vérifié par sa signature ; un billet déjà à bord est reconnu (rien ne change), un billet
  inconnu / annulé / d'un autre départ est refusé et le scan n'est pas gardé.
- **Dépense** : catégorie carburant / péage / autre ; le péage est rangé « autre » dans `depart_depense.nature`
  (la catégorie exacte est gardée à côté). Un départ « arrivé » accepte encore une dépense (le plein du retour).
- **Incident / retard** : un SMS par numéro joignable parmi les voyageurs à bord (billets « embarqué » ou « en
  voyage »), plus un SMS à la gare (superviseurs). Rejouer l'événement ne renvoie rien.
- **Arrivée** : à la destination, le départ passe à « arrivé ».
- **Contrôle** : un seul contrôle ouvert par contrôleur (index unique partiel en base). Le serveur garde le constat
  de chaque siège ; sans constat, un siège avec billet valide est « scanné », sinon « libre ». `liste` = billets
  valides, `têtes` = sièges non libres, `écart` = têtes − liste. À la clôture, **les comptes figés sont ceux du
  serveur**, pas ceux envoyés par le téléphone (qui sont ignorés) ; le contrôle devient immuable (déclencheur
  SQL). Le constat est « remis au patron » (lu dans `controle_inopine`) ; un SMS part en plus si l'écart n'est pas
  nul ou si un convoyeur a été signalé.

## Tables PostgreSQL (migrations `0010c`)

Additives. `202610180010c00_bord` : colonnes ajoutées à `depart_incident` (`categorie`, `auteurId`, `latitude`,
`longitude`, `precisionM`, `note`) et `depart_depense` (`categorie`, `justificatifRef`, `auteurId`) ; tables
`vente_en_route`, `passage_route`, `controle_inopine`, `controle_siege`, `controle_signalement`,
`controle_regularisation`. `202610180010c10_bord_garanties` : clés étrangères, `CHECK`, `passage_route` en ajout
seul, un seul contrôle ouvert par contrôleur, contrôle clos figé (seul `envoyeAuPatron` peut passer à vrai),
pas de vidage ni de suppression d'un contrôle.

| Port            | Table(s)                                                                                |
| --------------- | --------------------------------------------------------------------------------------- |
| `VentesEnRoute` | `vente_en_route` (le billet est dans `billet`)                                          |
| `PassagesRoute` | `passage_route` (scans et arrivées, ajout seul)                                         |
| `DepensesBord`  | `depart_depense` (lot C, lit aussi les lignes saisies ailleurs)                         |
| `IncidentsBord` | `depart_incident` (lot C)                                                               |
| `RetardsDepart` | `depart_observation.retardMinutes` (lot C)                                              |
| `ControlesBord` | `controle_inopine`, `controle_siege`, `controle_signalement`, `controle_regularisation` |

## Règles provisoires et décisions à confirmer

Choisies faute de précision dans les contrats ; à confirmer par le produit.

- Limite de vitesse 100 km/h, retard proposé 20 min, jour de paie « lundi » ; `excesVitesse` et `aRecevoir` valent
  0 (le serveur ne mesure pas la vitesse par trajet et ne calcule pas la paie).
- Convoyeur : `reservees` vaut 0 (places gardées pour un arrêt non décrites côté serveur), `reseau` vaut
  `en_ligne` (le serveur ne voit pas l'appareil), la destination proposée est le dernier arrêt de la ligne.
- Contrôle : `montantDeclare` du voyageur sans billet = tarif plein de la ligne (le contrat ne le porte pas) ; la
  régularisation ne peut pas dépasser ce tarif ; le billet régularisé est vendu en canal `convoyeur`
  (où va l'argent encaissé par le contrôleur ? à confirmer) ; `GET /agence/controle/inopine` **ouvre** un
  contrôle sur le bus en route le plus récent de la compagnie quand le contrôleur n'en a pas d'ouvert.
- Les identifiants `billetId`, `depenseId` et `incidentId` doivent être des UUID (422 `IDENTIFIANT_INVALIDE`,
  les colonnes étant UUID) alors que le contrat les dit opaques ; `convoyeurId` d'un signalement accepte aussi
  l'identifiant provisoire `convoyeur-du-depart-<departId>` que l'écran envoie.
- `garePrevenue` signifie « au moins un superviseur de la gare a reçu le SMS » ; `envoyeAuPatron` est vrai dès la
  clôture (le constat est lisible par le patron) même si le SMS de synthèse échoue.
- Un retard est accepté tant que le départ n'est ni arrivé ni annulé (en « parti » aussi).
- Les événements `route.*`, `chauffeur.*` et `controle.*` rejoués par `/sync` (appareil resté hors ligne) sont
  journalisés et occupent le siège, mais ne créent ni le billet du bord, ni la dépense, l'incident, le retard ou
  le contrôle : ils ne passent pas par ce module. Hors périmètre du lot (`/sync` n'est pas traité) ; à brancher
  quand le moteur de synchronisation appellera `ConvoyeurService`, `ChauffeurService` et `ControleService`.

## Textes inventés (SMS)

- Incident aux voyageurs : « {compagnie} : {nature} sur le bus {origine} > {destination} de {HHhMM}. Nous vous
  tenons informés. »
- Incident à la gare : « AfriMove : {nature} sur le bus {immat} ({trajet}, {heure}). {n} voyageur(s) prévenu(s). »
- Retard à la gare : « AfriMove : le bus {immat} ({trajet}, {heure}) aura {minutes} min de retard. {n}
  voyageur(s) prévenu(s). »
- Signalement au patron : « AfriMove : contrôle inopiné du bus {immat} ({trajet}). {convoyeur} est signalé : le
  voyageur du siège {s} dit avoir payé {montant} F sans billet enregistré. »
- Constat au patron : « AfriMove : contrôle inopiné du bus … : {têtes} têtes pour {liste} billets, écart {±n}.
  [Convoyeur signalé N fois.] »
- Le SMS du retard aux voyageurs et celui du billet utilisent les modèles existants de la passerelle SMS.

## Tests

`regles.test.ts` (règles pures et garde de production), `parite.test.ts` (lecteurs écrits à la main contre les
schémas zod du contrat), `convoyeur.e2e.test.ts`, `chauffeur.e2e.test.ts`, `controle.e2e.test.ts` (API complète
en mémoire, `testing/app-bord-test.ts`), `postgres.integration.test.ts` (même contrat de ports sur la mémoire et
sur PostgreSQL — `testing/contrat-ports.ts` — puis les garanties de la base ; ignoré sans `DATABASE_URL_TEST`).
