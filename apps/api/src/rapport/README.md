# Rapport du soir (AM-171)

À 21 h (heure de Douala), le patron reçoit le bilan de sa journée : billets, colis, recette, cash et
mobile money, écarts de caisse gare par gare, départs fusionnés, soute pleine, ventes en route,
remplissage, annulations, ventes en ligne, signatures des superviseurs. Ce module **arrête** ce
rapport une fois par compagnie et par jour, puis le sert à l'application du patron
(`GET /patron/rapports/soir`) et à la passerelle WhatsApp (AM-167). Maquette :
`docs/maquettes-v3/RapportSoir.dc.html`. Contrat : `RapportSoir` de `@afrimove/contrats`
(`patron/rapport.ts`).

Le module est **autonome** : il ne dépend que du socle (configuration, audit, horloge). Tout le reste
passe par des ports (classes abstraites, `ports.ts`) avec une version en mémoire (`memoire.ts`) et une
version PostgreSQL (`postgres.ts`, lot A) choisie selon `API_STOCKAGE` (voir « Ports et adaptateurs »).

## Ce que fait le module

| Fichier                  | Rôle                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `calcul.ts`              | `construireRapport` : fonction pure des faits du jour. Aucun flottant sur les montants, au franc près.                   |
| `collecte.service.ts`    | Rassemble les faits par les ports ; une source complémentaire en panne n'empêche pas le rapport (voir « Mode dégradé »). |
| `rapport.service.ts`     | `generer` (idempotent), `pourLApp`, `pourEnvoi`, `genererPourToutes`. Audit `rapport.genere`.                            |
| `planificateur.ts`       | `tick()` toutes les 30 s : dès 21:00, arrête le rapport de chaque compagnie qui n'a pas encore le sien.                  |
| `rapport.controller.ts`  | `GET /patron/rapports/soir?jour=AAAA-MM-JJ`, rôle `patron`.                                                              |
| `source-whatsapp.ts`     | `SourceRapportSoirPourWhatsApp` : le rapport arrêté ici, lu par la passerelle WhatsApp.                                  |
| `ponts.ts`               | Adaptateurs construits sur les ports de la caisse, de la billetterie et de la numérotation.                              |
| `postgres.ts`            | Adaptateurs PostgreSQL (Prisma) : référentiel, billets, colis, annulations, contrôles en route, rapports arrêtés.        |
| `memoire.ts`, `testing/` | Adaptateurs en mémoire (avec `enPanne` pour simuler une panne) et jeu d'essai « planche » de la maquette.                |

### Route

`GET /patron/rapports/soir`, paramètre optionnel `jour` (`AAAA-MM-JJ`).

- Sans `jour` : le dernier rapport dû (celui d'aujourd'hui à partir de 21:00, celui d'hier avant).
- `403` : rôle autre que `patron` (le gardien de rôles refuse tout `/patron/**`), ou compte sans compagnie
  (`HORS_PERIMETRE`).
- `400 REQUETE_INVALIDE` : paramètre inconnu ou `jour` mal formé.
- `404 RAPPORT_PAS_ENCORE` : le jour demandé n'est pas encore arrêté (avant 21:00, ou jour futur).
- `404 RAPPORT_INTROUVABLE` : compagnie inconnue ou jour plus ancien que `RAPPORT_JOURS_HISTORIQUE`.
- Un rapport dû mais jamais arrêté (planificateur en retard, jour passé) est arrêté à la demande.

### Définitions et décisions de calcul

- **Jour** : de 00:00 à 24:00 heure de Douala (UTC+1, sans heure d'été), quel que soit le fuseau du serveur.
- **Vente de billet** : billet créé ce jour-là, ni `annule`, ni `reserve` (commande en ligne non payée), ni
  issu d'un report (`reporte_de_id` non nul : il remplace un billet déjà compté).
- **Montant d'un billet** : `prix + bagage` (l'argent entré pour ce billet). **Montant d'un colis** : `prix_total
  - complement_poids`.
- **Recette** = billets + colis. **Cash** = ventes réglées en `cash`. **Mobile money** = recette − cash (un
  mode non renseigné compte en mobile money, jamais en cash). `recette = cash + momo` toujours.
- **Variation** des billets : par rapport au nombre de billets de la veille (même définition), en % à une
  décimale ; `0` quand la veille est vide.
- **Écart d'une gare** : somme signée des écarts (compté − attendu) des caisses clôturées de la gare.
- **Remplissage moyen** : places occupées / places offertes, sur les départs qui ne sont ni annulés ni
  fusionnés. Un départ sous 60 % est signalé (le moins rempli) : « le 09:30 Alpha Voyages part à 38 % ».
- **Annulations** : nombre, montant rendu au client, `toutesAvecPin` (vrai s'il n'y en a aucune).
- **En ligne** : billets vendus par le canal `en_ligne` et leur part des ventes.
- **Signatures** : les superviseurs qui ont validé au moins une caisse de la gare, une fois par gare.
- **Gares** : celles du référentiel, rangées par nombre de billets décroissant puis par nom.
- **Remarques d'une gare** (max 10, la dernière devient « N autres remarques ») : caisses (clôturées, non
  validées, ouvertes, sans comptage), départs fusionnés, soute pleine, billets de cadence sans nom, trous de
  numérotation, incidents de sources.

### Mode dégradé et règle des 21 h

- Le rapport **part à l'heure même si une caisse n'est pas validée** : elle est signalée dans la gare
  (« guichet 4, caisse non validée (écart −1 000 F) »). Rien n'attend personne.
- Sources **essentielles** (si elles échouent, le rapport n'est pas arrêté, le planificateur réessaie au
  passage suivant, jusqu'à minuit) : référentiel des gares, billets du jour et de la veille.
- Sources **complémentaires** (colis, litiges, caisses, départs, annulations, numérotation, contrôles en
  route) : en cas de panne, le rapport part sans elles et une remarque « <source> : données indisponibles »
  est portée sur la première gare.
- **Un rapport par compagnie et par jour, figé** : une caisse validée ou un trou comblé après 21:00 ne change
  pas ce que le patron a reçu. Deux instances qui tournent en même temps ne produisent qu'un rapport
  (`INSERT … ON CONFLICT DO NOTHING`).

## Ports et adaptateurs

| Port                 | Ce qu'il lit                                   | Adaptateur fourni                                   |
| -------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `ReferentielRapport` | compagnies actives et gares                    | mémoire ; **PostgreSQL** `ReferentielRapportPrisma` |
| `VentesBillets`      | billets créés dans le jour                     | mémoire ; **PostgreSQL** `VentesBilletsPrisma`      |
| `DepartsDuJour`      | départs du jour, remplissage, fusions, soute   | mémoire ; **pont billetterie**                      |
| `ActiviteColis`      | colis enregistrés, réclamations ouvertes       | mémoire ; **PostgreSQL** `ActiviteColisPrisma`      |
| `CaissesDuJour`      | sessions de caisse du jour (écart, validation) | mémoire ; **pont caisse**                           |
| `AnnulationsDuJour`  | annulations décidées dans le jour              | mémoire ; **PostgreSQL** `AnnulationsDuJourPrisma`  |
| `TrousNumerotation`  | trous de numérotation ouverts                  | mémoire ; **pont numérotation**                     |
| `ControlesEnRoute`   | contrôles inopinés à bord                      | mémoire ; **PostgreSQL** `ControlesEnRoutePrisma`   |
| `AssistantRapport`   | question suggérée et sa réponse (AM-109)       | `AssistantRapportAucun` (question vide)             |
| `RapportsSoir`       | les rapports arrêtés (écriture)                | mémoire ; **PostgreSQL** `RapportsSoirPrisma`       |

### Choix du stockage (`API_STOCKAGE`)

`RapportModule` choisit les adaptateurs des six ports ci-dessus au montage, par `stockageSurPostgres(config)` :
`API_STOCKAGE=postgres` donne PostgreSQL, `API_STOCKAGE=memoire` la mémoire, et sans la variable PostgreSQL en
production, la mémoire ailleurs (les tests restent en mémoire sans rien configurer). Les trois ports des
ponts (départs, caisses, trous de numérotation) viennent de `RapportModule.avecModulesExistants()`, que
`AppModule` utilise déjà ; ils suivent le stockage des modules billetterie, caisse et numérotation.

Un adaptateur en mémoire déclare `durable = false` : `RapportModule` **refuse de démarrer en production**
tant qu'un port y est resté (`VerificationRapport`).

## Tables PostgreSQL

Le module n'écrit qu'une table, `rapport_soir` (migration `20261017000730_rapport_soir`, modèle `RapportSoir`
du schéma Prisma, bloc « lot A »). Tout le reste est lu dans les tables des autres modules.

### `rapport_soir` (en ajout seul)

| Colonne       | Type          | Rôle                                               |
| ------------- | ------------- | -------------------------------------------------- |
| `compagnieId` | `uuid`        | Compagnie du rapport (clé primaire avec `jour`).   |
| `jour`        | `date`        | Jour de Douala, sans fuseau.                       |
| `genereA`     | `timestamptz` | Instant où le rapport a été arrêté.                |
| `rapport`     | `jsonb`       | Le contrat `RapportSoir`, tel qu'envoyé au patron. |

- **Un rapport par compagnie et par jour** : clé primaire `(compagnieId, jour)`. `RapportsSoir.creer` est un
  `INSERT … ON CONFLICT DO NOTHING` (`createMany({ skipDuplicates: true })`) : le nombre de lignes écrites dit
  si le rapport est nouveau, sinon la ligne existante est relue et rendue (`nouveau: false`). Douze instances
  qui arrêtent le rapport en même temps n'en écrivent qu'un (testé).
- **Un rapport arrêté ne change plus** : déclencheurs contre `UPDATE`, `DELETE` et `TRUNCATE`
  (`interdire_modification()`).
- Pas de clé étrangère vers `compagnie` : comme les autres tables du lot, la cohérence est tenue par le
  référentiel (une compagnie inconnue n'obtient jamais de rapport) et non par la base.

### Lectures (jour de Douala, bornes `[00:00, 24:00[` à +01:00, toujours bornées à la compagnie)

| Port                          | Tables lues                            | Définitions retenues                                                                                                                                               |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ReferentielRapport`          | `compagnie` (`actif`), `gare`          | Gares dans l'ordre de leurs identifiants (UUID v7 : ordre de création).                                                                                            |
| `VentesBillets.duJour`        | `billet`, `depart`                     | `creeA` dans le jour, tous états. Montant = `prix + bagage`. Mode = `paiement ->> 'mode'` (absent = `null`). `departParti` = départ `parti` ou `arrive`.           |
| `ActiviteColis.enregistresLe` | `colis`                                | `creeA` dans le jour. Colis payé : `prixTotal` (il contient déjà le complément de poids). Port pas encore payé : seul le complément de poids est entré, sans mode. |
| `ActiviteColis.litiges…`      | `reclamation_colis`                    | `ouverteA` dans le jour.                                                                                                                                           |
| `AnnulationsDuJour.duJour`    | `demande_annulation`, `billet`         | Demandes `decidee` dans le jour avec décision `rembourser` ou `avoir`, toutes avec PIN. Montant = `montant` (zéro si absent). `reporter` et `refuser` exclues.     |
| `ControlesEnRoute.duJour`     | `journal_evenement`, `depart`, `ligne` | Événements `controle.regularise`, `controle.convoyeur_signale`, `controle.cloture` du jour, regroupés par `controleId`, départs de la compagnie (via la ligne).    |

Le **mode de paiement** des billets et des colis est ramené aux trois du rapport (`modeDuRapport`) :
`cash` / `especes` / `especes_agence` → cash ; `momo` / `mtn` / `mtn_momo` / `momo_marchand` → momo ;
`orange_money` / `orange` → orange_money ; tout autre (`carte`…) ou absent → `null`, compté en mobile money.

Le **lieu d'un contrôle** est le dernier arrêt annoncé par le chauffeur (`chauffeur.arrivee_arret`) pour ce
départ avant le contrôle ; vide quand aucun arrêt n'a été annoncé (le rapport n'invente pas de lieu).
Les événements dont la charge est mal formée (départ ou contrôle absent) sont ignorés.

Un billet de cadence est « sans nom » tant que son drapeau `aCompleterAuQuai` est levé : la billetterie le
baisse quand le nom est complété au quai.

**Ponts déjà fournis** (aucune requête à écrire) : `CaissesDuJourSessions` (`SessionsCaisse.deGare`),
`DepartsDuJourBilletterie` (`Catalogue`, `Billets`, `ColisDuDepart`), `TrousNumerotationControle`
(`ControleJourneeService.controler`).

### Ce qui reste hors du rapport

- **Annulations faites en ligne par le voyageur** (sans PIN, `avecPin = false`) : le schéma ne garde pas le
  montant rendu ; l'événement `billet.annule` passe par les avis de la billetterie. Elles ne sont pas encore
  comptées (le rapport compte les annulations à PIN). À brancher quand ce lien existera.
- `AssistantRapport` : tant que l'assistant (AM-109) n'est pas branché, la question suggérée est vide.

## Intégration (coordinateur)

1. `AppModule` : `RapportModule.avecModulesExistants()` est déjà importé ; les six adaptateurs PostgreSQL sont
   choisis par `API_STOCKAGE` dans le module. Rien d'autre à brancher. (`avec` / `avecModulesExistants`
   acceptent toujours des fournisseurs qui remplacent ceux par défaut.)
2. WhatsApp : dans `WhatsAppModule.avec({ imports: [RapportModule], providers: [{ provide: SourceRapportSoir,
useExisting: SourceRapportSoirPourWhatsApp }, { provide: AnnuaireRapport, useClass: … }] })`. L'annuaire
   des destinataires (le patron et les gérants) reste à fournir. Quand le planificateur de la passerelle passe à
   21:00, `rapport()` arrête le rapport s'il ne l'est pas encore : l'envoi ne dépend pas de l'ordre des
   planificateurs.
3. Assistant (AM-109) : fournir `AssistantRapport` ; sans lui, la question suggérée est vide.
4. Écran patron : `creerClientHttp` + `OP_RAPPORT_SOIR` de l'api-client appellent déjà cette route (vérifié
   par `rapport.e2e.test.ts` contre un vrai serveur HTTP).

### Variables d'environnement

| Variable                   | Défaut  | Rôle                                                                     |
| -------------------------- | ------- | ------------------------------------------------------------------------ |
| `RAPPORT_HEURE`            | `21:00` | Heure d'arrêt du rapport, heure de Douala.                               |
| `RAPPORT_PLANIFICATEUR_MS` | `30000` | Période du planificateur ; `0` le désactive (défaut en `NODE_ENV=test`). |
| `RAPPORT_JOURS_HISTORIQUE` | `31`    | Au-delà, un rapport jamais arrêté n'est plus produit à la demande.       |

## Points à confirmer avec le métier

- Définition de la vente (annulés, réservés et remplaçants de report exclus) et du montant (prix + bagage).
- Mobile money = recette − cash ; un mode de paiement absent compte en mobile money.
- Remplissage pondéré par les places ; seuil de signalement à 60 %.
- Montant d'une annulation = somme rendue au client ; `reporter` et `refuser` exclus.
- « Soute pleine » = autant de colis chargés que de places de soute du bus.
- Rapport figé à l'instant de sa génération (pas de mise à jour après 21 h).
- Le rôle comptable n'a pas accès à la route (réservée au patron).
- Les superviseurs signent avec le nom complet de leur gare.

## Tests

`pnpm --filter @afrimove/api test -- src/rapport` : `calcul.test.ts` (chiffres exacts de la maquette :
1 004 billets, 4 410 000 F dont 2 900 000 F de cash), `rapport.service.test.ts` (idempotence, jour dû, sources
en panne), `contrat.test.ts` (schéma zod du contrat, validation WhatsApp, intégration avec la passerelle),
`rapport.e2e.test.ts` (route, rôles, client HTTP réel), `ponts.test.ts`, `module.test.ts`, `temps.test.ts`.

PostgreSQL (lot A) : `postgres.integration.test.ts`, ignoré sans `DATABASE_URL_TEST` :

    DATABASE_URL_TEST=postgresql://user@localhost:5432/afrimove_test pnpm --filter @afrimove/api test -- src/rapport/postgres

Il rejoue sur la mémoire et sur PostgreSQL le même contrat du port `RapportsSoir` (`testing/contrat-stockage.ts`),
puis vérifie ce que seule la base garantit (ajout seul, clé primaire, douze arrêts simultanés), les cinq
lectures sur un monde de deux compagnies (bornes du jour de Douala à la milliseconde, périmètre de la
compagnie, charges mal formées) et l'API de bout en bout avec `API_STOCKAGE=postgres` (rapport calculé sur les
tables, figé après 21 h, deux instances en concurrence).
