# USSD \*123# (AM-169)

Le service d'AfriMove sur un téléphone à touches : on compose `*123#`, on répond avec des chiffres.
Menu (Billet, Mon billet, Colis, Suivre bus, Proche, Aide), achat d'un billet **en trois réponses**,
paiement MoMo, SMS du billet avec son code à 4 chiffres, connecteurs MTN et Orange, mode dégradé et
journalisation.

Module Nest autonome : `UssdModule`. Il s'appuie sur la billetterie (AM-162) et les paiements (AM-165)
par leurs services exportés, sans les modifier, et il importe `BilletterieModule`, `PaiementsModule` et
`SmsModule`. Les écrans sont ceux de la planche « USSD » (`docs/maquettes-v3/USSD.dc.html`, aperçu
`apps/web/src/ecrans/USSD`, fixtures `packages/fixtures/src/ecrans/USSD.ts`) ; `textes.test.ts` les
compare au fixture de la planche, ligne à ligne.

**Aucun accès réseau ni compte sandbox pendant le développement** : les formats d'échange avec MTN et
Orange sont des formes courantes, écrites de mémoire, et **rien n'a été vérifié contre un opérateur**
(voir « Ce qui n'a pas pu être vérifié »).

## Les trois réponses

```
*123#            AfriMove              ◄── menu de la planche
                 1 Billet
                 2 Mon billet
                 3 Colis
                 4 Suivre bus
                 5 Proche
                 0 Aide

                 Repondre:  1
réponse 1  ──►   Douala>Yaounde        ◄── les 3 prochains départs du trajet
                 1 08:00 Beta VIP 7500
                 2 08:30 Alpha 4000
                 3 09:30 Omega 3800
réponse 2  ──►   Place: 1              ◄── siège retenu 15 minutes
                 Payer MoMo? 1=oui
réponse 1  ──►   (fin) Confirme le paiement sur ton telephone. Le SMS arrive avec ton code.
```

Le paiement est asynchrone : la session se termine dès que la demande MoMo est partie. Le voyageur
valide sur son téléphone ; la confirmation arrive aux paiements par le webhook de l'agrégateur ; le
billet est émis (`CommandesService.confirmerPaiement`) ; `SuiviAchatsUssdService` envoie alors le SMS.

```
opérateur ──► POST /ussd/:operateur ──► ConnecteurMtn | ConnecteurOrange ──► EntreeUssd
                  (jeton)                        │
                                                 ▼
                                      DialogueUssdService        session chiffrée (SessionsUssd)
                                       │          │
                       AchatUssdService│          │JournalisationUssd (numéro masqué, aucun écran)
                  départs, siège, commande
                  (billetterie)  paiement MoMo (paiements)
                                                 │
 webhook de l'agrégateur ─► paiements ─► billet émis ─► SuiviAchatsUssdService ─► SMS du billet
```

### Les touches

| Touche           | Ce qu'elle fait                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 Billet**     | Les 3 prochains départs du trajet (aujourd'hui, sinon demain). Mêmes filtres, même ordre et mêmes prix que l'application (`DepartsService.rechercher`). Le plus petit siège libre est retenu. |
| **2 Mon billet** | Le prochain billet payé : numéro, compagnie, heure, trajet, place et code à 4 chiffres, avec le nombre des autres billets à venir.                                                            |
| **3 Colis**      | Demande le numéro du colis, répond par son état (Depose, Charge, En route, Disponible, Remis). Port `SuiviColisUssd`.                                                                         |
| **4 Suivre bus** | Arrivée prévue, retard et prochain arrêt du bus du prochain billet. Port `SuiviBusUssd`.                                                                                                      |
| **5 Proche**     | Demande le numéro du proche, puis le même achat : le billet est à son nom (`Proche 3456`), le SMS part vers son numéro, le paiement vient du téléphone qui a composé le code.                 |
| **0 Aide**       | Un écran d'aide, la session se termine.                                                                                                                                                       |

Une réponse invalide réaffiche l'écran précédé de « Choix invalide » ; trois de suite ferment la
session (`USSD_ERREURS_MAX`). Toute session sans réponse expire (`USSD_SESSION_TTL_S`, 120 s).

## Garanties

| Exigence                                     | Comment elle est tenue                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Le texte du menu est celui de la maquette    | Une seule source (`textes.ts`) pour les écrans envoyés et pour l'aperçu `GET /voyageur/sans-internet`. `textes.test.ts` compare menu, départs, « Place : n » et « Payer MoMo ? » au fixture de la planche, au caractère près.                                                              |
| Fonctionne sur un téléphone à touches        | Réponses numériques, ASCII seulement (pas d'accent : `sansAccents`), 160 caractères au plus par écran (`ajusterEcran`, testé sur les valeurs les plus longues). Aucune page web, aucun lien à ouvrir pendant la session ; le SMS porte le code à 4 chiffres, utilisable sans scanner.      |
| Mêmes règles, mêmes prix, zéro frais en plus | Aucune règle recopiée : la liste, le siège, la commande et le paiement passent par la billetterie et les paiements. La commande porte un code `frais_offerts` (`USSD_CODE_SANS_FRAIS`) : le prix payé est le prix affiché ; si le total n'est pas celui du tarif, la commande est annulée. |
| Un siège ne se vend pas deux fois            | Le siège est retenu par `CommandesService.creer` (inventaire atomique, 15 minutes). Si un autre voyageur nous devance, le siège suivant est essayé (3 essais). Test : 5 voyageurs simultanés, 5 sièges distincts.                                                                          |
| Un voyageur ne paie pas deux fois            | Rejouer « 1 » après la fin de la session ne fait rien (session supprimée). Un second achat sur le même départ pendant qu'un paiement est en cours est refusé (« paiement déjà en cours ») au lieu d'annuler la commande en cours et de provoquer un remboursement.                         |
| Une place abandonnée est rendue              | « Autre chose que 1 », le signal de fermeture de l'opérateur (Orange) ou une session échue (passage de `SuiviAchatsUssdService`, sans attendre les 15 minutes de la commande).                                                                                                             |
| Le SMS du billet part une fois               | `SuiviAchatsUssdService` envoie quand la commande est payée, par `PasserelleSmsService.envoyerBillet` (clé d'idempotence `billet:<id>:<numéro>`). Un échec est repris au passage suivant ; un passage répété n'envoie rien de plus.                                                        |
| Rien d'identifiant en clair                  | Sessions et destinataires chiffrés (`ChiffrementService`, contextes `ussd.session:<clé>` et `ussd.achat:<commande>`). Le journal ne garde que le numéro masqué, l'empreinte de la session, l'étape et un code court : jamais un écran ni une réponse (testé).                              |
| Un appel d'opérateur est authentifié         | Jeton propre à chaque opérateur (`Authorization: Bearer` ou `x-ussd-jeton`), comparé en temps constant ; un connecteur sans jeton est inactif (404). L'identifiant de session ne sert qu'au numéro qui l'a ouverte.                                                                        |

## Mode dégradé et pannes

- **Paiement en ligne indisponible** (coupé par AfriMove, agrégateur absent, circuit ouvert après des
  pannes : `ModeDegradeService`) : « 1 Billet » répond tout de suite « Paiement MoMo indisponible. Achete
  ton billet a la gare. » et **ne retient aucune place**. « 2 Mon billet », « 3 Colis », « 4 Suivre bus » et
  « 0 Aide » restent disponibles.
- **Coupure entre le choix du départ et « 1 »**, ou compagnie sans compte de reversement : même réponse, la
  place retenue est rendue.
- **Demande de paiement refusée** par l'agrégateur : « Paiement refuse », la place est rendue.
- **Demande incertaine** (réponse perdue, agrégateur injoignable) : la session dit de confirmer sur le
  téléphone ; le webhook ou le balayage des paiements tranche, et le SMS ne part que si le billet est émis.
- **Toute autre panne** : « Service indisponible. Reessaie plus tard. », la session est supprimée, le
  journal garde un code court et les logs la cause.
- **Journal** (`JournalUssd`) : ouverture, réponse (avec l'étape et la durée), fermeture par le voyageur,
  session expirée, numéro incohérent, jeton refusé, requête illisible, achat réservé / abandonné,
  paiement demandé / refusé, mode dégradé, SMS du billet envoyé / en échec. Une panne du journal ne
  casse jamais une session.

## Routes

| Méthode et chemin             | Rôle                                                                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /ussd/:operateur`       | Public, jeton de l'opérateur. `:operateur` = `mtn` ou `orange`. 200 avec l'écran suivant ; 400 requête illisible ; 401 jeton ; 404 opérateur inconnu ou sans jeton.                                                    |
| `GET /voyageur/sans-internet` | `@Roles("voyageur")`. L'aperçu de l'écran « Sans internet » (`SchemaApercuSansInternet`) : les lignes de l'écran USSD viennent de `textes.ts` ; la conversation WhatsApp est celle de la planche, en attendant AM-168. |

## Connecteurs MTN et Orange (formats provisoires)

Un connecteur ne fait que traduire (`connecteurs.ts`). Tout changement de format se fait là, nulle part
ailleurs.

| Opérateur | Requête                                                                                                                  | Réponse                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| MTN       | JSON ou formulaire `{ sessionId, msisdn, serviceCode, text }`. `text` cumule les réponses (`1*2*1`), vide à l'ouverture. | Texte brut, `CON <écran>` (la session continue) ou `END <écran>`. |
| Orange    | JSON `{ session_id, msisdn, request_type: begin / continue / end, input }`. `end` : le voyageur quitte.                  | JSON `{ "message": "<écran>", "action": "continue" / "end" }`.    |

Le numéro (`msisdn`) est accepté avec ou sans `+` ; seuls les mobiles camerounais (`+2376…`) sont admis
(MoMo et SMS en dépendent). L'opérateur qui appelle est celui du téléphone : la session MTN débite MTN
MoMo, la session Orange débite Orange Money.

## Ports et adaptateurs

`ports.ts` déclare des classes abstraites ; `memoire.ts` en donne les versions en mémoire (`durable =
false`) et `postgres.ts` celles de PostgreSQL (lot A). Les sessions, le journal et les achats sont choisis au
montage par `API_STOCKAGE` (`postgres` / `memoire`, sinon PostgreSQL en production et mémoire ailleurs ;
`FOURNISSEURS_STOCKAGE_USSD` dans `ussd.module.ts`). `UssdModule` **refuse de démarrer en production** tant que
les sessions, le journal ou les achats sont en mémoire, ou que le SMS du billet n'est pas branché. Le
coordinateur remplace le reste avec `UssdModule.avec({ imports, providers })`.

| Port                  | Par défaut                                                                      | À fournir par                                                                                      |
| --------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `SessionsUssd`        | `SessionsUssdPrisma` (table `ussd_session`) selon `API_STOCKAGE`, sinon mémoire | Fourni. Partagé entre instances. Redis (`SET … PXAT`) reste possible en remplaçant ce fournisseur. |
| `JournalUssd`         | `JournalUssdPrisma` (table `ussd_journal`) selon `API_STOCKAGE`, sinon mémoire  | Fourni.                                                                                            |
| `AchatsUssd`          | `AchatsUssdPrisma` (table `ussd_achat`) selon `API_STOCKAGE`, sinon mémoire     | Fourni (`transitionner` = `UPDATE … WHERE etat IN (…)`).                                           |
| `ComptesUssd`         | `ComptesUssdComptes` (fourni)                                                   | Le compte du numéro, retrouvé ou créé (rôle voyageur, nom vide) par `ComptesService`.              |
| `NotifieurBilletUssd` | `NotifieurBilletSms` (fourni)                                                   | SMS « billet » par `PasserelleSmsService.envoyerBillet`.                                           |
| `SuiviColisUssd`      | `SuiviColisAucun` (« introuvable »)                                             | **AM-163** (colis) : état du colis pour son expéditeur ou son destinataire seulement.              |
| `SuiviBusUssd`        | `SuiviBusAucun` (« pas de position »)                                           | **AM-170** (GPS) : arrivée estimée, retard et prochain arrêt d'un billet.                          |

## Tables PostgreSQL

Migration `20261017000750_ussd` (modèles `UssdSession`, `UssdJournal` et `UssdAchat` du bloc « lot A » de
`schema.prisma`). Colonnes en camelCase comme le reste du schéma.

| Table          | Contenu                                                                                                                                     | Garanties de la base                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ussd_session` | `cle` (`<opérateur>:<session de l'opérateur>`, clé primaire), `expireA`, `charge` (état du dialogue chiffré, contexte `ussd.session:<cle>`) | Charge non vide ; écriture par `INSERT … ON CONFLICT DO UPDATE` ; `lire` ne rend jamais une session échue et la supprime ; index sur `expireA` pour `purger`.                                                                |
| `ussd_journal` | `id`, `at`, `operateur`, `msisdnMasque`, `sessionRef` (12 caractères d'un HMAC), `evenement`, `etape`, `code` court, `dureeMs`              | Opérateur, événement et étape en listes fermées (un nouvel événement demande une migration) ; déclencheur contre `UPDATE` (la trace ne se réécrit pas), `DELETE` permis pour la purge ; même entrée rejouée = une ligne.     |
| `ussd_achat`   | `commandeId` (clé primaire), `voyageurId`, `operateur`, `etat`, `destinataireChiffre` (contexte `ussd.achat:<commandeId>`), `creeA`         | Opérateur et état en listes fermées ; `ajouter` en `ON CONFLICT DO NOTHING` ; `transitionner` en `UPDATE … WHERE etat IN (…)` : deux instances ne réussissent jamais la même transition ; index partiel des achats à suivre. |

Le journal ne contient aucune donnée personnelle directe ; **prévoir une purge** (par exemple 90 jours : `DELETE
FROM ussd_journal WHERE at < now() - interval '90 days'`), ainsi que celle des sessions échues
(`SessionsUssd.purger`) et des achats terminés ou abandonnés. Aucune de ces purges n'est planifiée aujourd'hui.

**Reste en mémoire** : `SuiviColisUssd` (touche 3, modules colis AM-163) et `SuiviBusUssd` (touche 4, GPS AM-170) ne
sont pas des tables de ce module : leurs adaptateurs lisent les données des autres modules et se branchent
avec `UssdModule.avec`.

## Variables d'environnement

| Variable                              | Défaut                    | Rôle                                                                                       |
| ------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| `USSD_MTN_JETON`, `USSD_ORANGE_JETON` | (aucun : inactif)         | Jeton de chaque connecteur, 32 caractères au moins, distincts. Au moins un en production.  |
| `USSD_CODE_SERVICE`                   | `*123#`                   | Code affiché dans l'aperçu et dans les messages d'erreur.                                  |
| `USSD_SESSION_TTL_S`                  | 120                       | Durée de vie d'une session sans réponse (20 à 600).                                        |
| `USSD_TRAJET_DEFAUT`                  | `DLA>YDE`                 | Trajet des voyageurs sans billet (codes de ville de la billetterie).                       |
| `USSD_NOMBRE_DEPARTS`                 | 3                         | Départs listés (1 à 5).                                                                    |
| `USSD_CODE_SANS_FRAIS`                | `USSD`                    | Code promotionnel de type `frais_offerts` : **doit exister** dans les promotions.          |
| `USSD_BASE_LIEN_BILLET`               | `https://afrimove.app/b/` | Début de l'adresse du billet dans le SMS ; l'hôte doit être dans `SMS_HOTES_LIENS`.        |
| `USSD_BALAYAGE_MS`                    | 10 000                    | Intervalle du suivi des achats (SMS du billet, places abandonnées) ; 0 = aucune minuterie. |
| `USSD_ABANDON_MARGE_S`                | 60                        | Marge après la fin de session avant de libérer une place non payée.                        |
| `USSD_ERREURS_MAX`                    | 3                         | Réponses invalides de suite avant de fermer la session.                                    |

## Intégration (coordinateur)

1. **`AppModule`** : importer `UssdModule` (il importe déjà `BilletterieModule`, `PaiementsModule` et `SmsModule`).
2. **Promotions** : créer le code `USSD` (type `frais_offerts`), ou régler `USSD_CODE_SANS_FRAIS` sur un code
   existant. Sans lui, aucun achat n'est possible (« Service indisponible » et une erreur dans les logs).
3. **Adaptateurs** : les sessions, le journal et les achats n'ont rien à brancher (PostgreSQL par
   `API_STOCKAGE`). Reste à fournir, par `UssdModule.avec({ providers: [ … ] })`, le suivi des colis
   (`SuiviColisUssd`) et celui des bus (`SuiviBusUssd`).
4. **Jetons** : un jeton par opérateur (`openssl rand -hex 32`), donné à l'opérateur avec l'adresse
   `https://<api>/ussd/mtn` ou `…/ussd/orange`, et le code court `*123#` à faire router vers cette adresse.
5. **SMS** : poser `SMS_HOTES_LIENS=afrimove.app` (ou le domaine retenu). Si l'intégration branche aussi
   `billet.emis` sur les SMS (billetterie, point 4), vérifier qu'elle passe par `envoyerBillet` : la clé
   d'idempotence évite alors un second SMS ; sinon désactiver l'un des deux.
6. **Autres écrans** : `GET /voyageur/sans-internet` remplace le mock de l'écran USSD (AM-045) en mode HTTP.

## Décisions à confirmer

- **« Zéro frais en plus »** : la planche affiche 4 000 F et promet zéro frais ; la commande porte donc un code
  `frais_offerts` et AfriMove absorbe les 250 F de frais de service. À confirmer avec le produit.
- **Siège attribué** : le plus petit siège libre (la planche n'a pas d'écran de choix : trois réponses).
  L'application et WhatsApp (AM-168) peuvent proposer « Changer de siège » ; pas l'USSD.
- **Trajet** : celui du dernier billet du voyageur, sinon `USSD_TRAJET_DEFAUT` (Douala>Yaoundé). La planche n'a
  pas d'écran de choix de ville : **un voyageur sans billet sur un autre trajet ne peut pas l'acheter par
  USSD**. Une ligne « Autre trajet » demanderait un écran de plus que la planche.
- **Départs** : les 3 prochains (comme la conversation WhatsApp), d'aujourd'hui, sinon de demain (« Douala>Yaounde
  demain »). Pas de page suivante.
- **Compte créé sans nom** à la première session. Le billet « pour moi » n'a donc pas de nom et suit le flux
  « billet à compléter au quai » (`sans_nom`) ; le billet d'un proche s'appelle `Proche 3456` (4 derniers chiffres).
- **Moyen de paiement** : celui de l'opérateur de la session. Un numéro porté vers l'autre réseau est débité sur
  le réseau qui appelle, ce qui est juste ; « Payer MoMo? » reste le texte de la planche pour Orange aussi.
- **Mode dégradé** : pas de réservation « à payer à la gare » par USSD (le guichet retrouve une commande par son
  identifiant, pas par le téléphone) ; on renvoie à la gare.
- **Mon billet** affiche le code à 4 chiffres : il est donné à qui a le téléphone (SIM) ; un échange de SIM donne
  accès aux billets à venir. Même niveau de confiance que le SMS.
- **Création de compte** pour tout numéro camerounais qui appelle (l'opérateur le certifie). Pas de limite par numéro
  au-delà de celles du SMS (10 par heure et par destinataire) et des paiements (un paiement en cours par commande).

## Ce qui n'a pas pu être vérifié

Aucun opérateur, aucun compte sandbox, aucun réseau : les formats d'échange MTN et Orange, le routage du code
court, la durée réelle des sessions, la longueur maximale d'un écran (160 caractères retenus, d'après le contrat
de l'aperçu), le jeton comme moyen d'authentification (les opérateurs filtrent parfois par adresse IP ou
authentification de base), le push MoMo pendant ou juste après une session USSD, et la tenue en charge des
adaptateurs PostgreSQL (éprouvés seulement sur une base locale de test) n'ont pas été vérifiés. Tout est testé avec
l'agrégateur simulé, la vraie billetterie et les ports en mémoire. Les tâches « compte et accès sandbox » et « tests en sandbox » du ticket restent à faire avec les opérateurs.

## Tests

`pnpm --filter @afrimove/api test` : `textes.test.ts` (parité avec la planche, ASCII, 160 caractères),
`config.test.ts`, `connecteurs.test.ts` (formats MTN et Orange, numéros), `ussd.module.test.ts` (garde-fou de
production), `postgres.integration.test.ts` (voir plus bas) et `ussd.e2e.test.ts` (HTTP avec la vraie billetterie et les vrais paiements : les trois réponses chez
MTN et chez Orange, webhook de confirmation, SMS du billet, abandon, expiration, proche, colis, bus, mode
dégradé, panne de l'agrégateur, jetons, confidentialité du journal, aperçu au format du contrat).

PostgreSQL (lot A) : `postgres.integration.test.ts`, ignoré sans `DATABASE_URL_TEST` :

    DATABASE_URL_TEST=postgresql://user@localhost:5432/afrimove_test pnpm --filter @afrimove/api test -- src/ussd/postgres

Il rejoue sur la mémoire et sur PostgreSQL le même contrat des trois ports (`testing/contrat-stockage.ts` :
sessions échues, transitions d'achat qui ne réussissent qu'une fois, journal sans doublon), puis vérifie ce que seule
la base garantit (deux instances sur la même base, listes fermées, journal non réécrit), le choix du stockage par
`API_STOCKAGE` et le parcours « trois réponses » de bout en bout avec des sessions, un journal et des achats en base
(aucun numéro ni écran en clair, place rendue à l'abandon et à l'expiration, cinq achats simultanés sur cinq sièges
distincts). La billetterie et les paiements y restent en mémoire.
