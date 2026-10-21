# Administration de l'agence (AM-093, AM-120)

Ce que le patron et le superviseur font **par l'API** au lieu de la base : créer et régler les lignes, générer les
départs d'après les horaires, ajouter les bus, affecter bus / chauffeur / convoyeur / quai, déclarer les téléphones
de guichet, les enrôler et les **effacer à distance** (niveau 2 du kiosque, `apps/web/src/kiosque/README.md`).

Aucune dépendance aux contrats, au domaine ni au client à l'exécution (paquets non compilés, API en CommonJS) : les
formes de corps sont recopiées dans `schemas.ts` et **`parite.test.ts` les compare** aux schémas zod des réglages du
patron (mêmes corps acceptés, mêmes corps refusés) et aux routes de `@afrimove/api-client`.

## Routes

Lignes : les trois routes sont **dictées par le client du patron** (`OP_LIGNE_EDITABLE`, `OP_MODIFIER_LIGNE`,
`OP_CREER_LIGNE`). Les autres routes `/patron/*` (personnes, règles, comptes MoMo…) ne sont pas de ce module.

**Ce module est le seul propriétaire des lignes** : leurs horaires, leurs réglages (plan, options, brouillon daté)
et la génération des départs. Le module patron n'a plus ni ces trois routes, ni service de lignes, ni tables de
lignes ; l'accueil `GET /patron/reglages` lit le résumé des lignes par `LignesService.resumes` (exporté par
`AdministrationModule`). `src/socle/routes-uniques.test.ts` vérifie qu'aucun couple (méthode, chemin) n'est servi
deux fois par l'application complète.

| Route                                                    | Rôles                          | Rôle de la route                                                                                                                                   |
| -------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /patron/reglages/lignes/:id`                        | patron                         | `LigneEditable` : départs récurrents, tarifs, arrêts (prorata), plan de sièges, options, brouillon.                                                |
| `PUT /patron/reglages/lignes/:id`                        | patron                         | `ModifierLigne` → `LignePubliee`. Signé par le PIN. `effetDu` futur : brouillon appliqué ce jour-là.                                               |
| `POST /patron/reglages/lignes`                           | patron                         | `CreerLigne` → `LignePubliee`. Signé par le PIN. Code de la ligne = code des deux gares (`DLAYDE`).                                                |
| `GET /admin/gares`                                       | patron, superviseur            | Les gares de l'agence (identifiants pour créer une ligne ou déclarer un appareil).                                                                 |
| `GET /admin/lignes`                                      | patron, superviseur            | Les lignes de l'agence (superviseur : celles qui partent de sa gare).                                                                              |
| `GET /admin/bus`                                         | patron, superviseur            | Les bus de l'agence.                                                                                                                               |
| `POST /admin/bus`                                        | patron                         | Ajouter un bus (immatriculation normalisée, unique par agence).                                                                                    |
| `PATCH /admin/bus/:id`                                   | patron                         | Modifier la fiche. Les places ne changent pas tant que le bus a des départs à venir (409 `BUS_AFFECTE`).                                           |
| `GET /admin/departs?jour=&ligneId=`                      | patron, superviseur            | Les départs d'un jour (aujourd'hui par défaut) avec bus, chauffeur, convoyeur, quai, billets vendus.                                               |
| `POST /admin/departs`                                    | patron, superviseur            | Créer un départ à l'unité (heure à venir, équipage facultatif).                                                                                    |
| `POST /admin/departs/generer`                            | patron, superviseur            | **Génération récurrente** : `{ ligneId?, du, au, ouvrirVente? }` → `{ crees, dejaPresents, passes, lignes }`. Rejouable.                           |
| `PATCH /admin/departs/:id/equipage`                      | patron, superviseur            | Bus, chauffeur, convoyeur, quai (seules les clés présentes changent ; `null` retire).                                                              |
| `GET /admin/appareils`                                   | patron, superviseur            | Les appareils (superviseur : ceux de sa gare) : rang, plage de numéros, enrôlé ou non, dernier ordre.                                              |
| `POST /admin/appareils`                                  | patron, superviseur            | **Déclarer** un appareil (fiche `appareil_sync` + code d'enrôlement). Signé par le PIN.                                                            |
| `POST /admin/appareils/:id/code`                         | patron, superviseur            | Nouveau code d'enrôlement (téléphone de secours ou code perdu). Signé.                                                                             |
| `POST /admin/appareils/:id/retrait`                      | patron, superviseur            | Retirer du service : plus de secret, synchronisation refusée. Signé.                                                                               |
| `POST /admin/appareils/:id/effacement`                   | patron, superviseur            | Émettre l'ordre d'**effacement à distance**. Corps `{ motif?, signature }`.                                                                        |
| `POST /appareils/enrolement`                             | public (code)                  | `{ code }` → `{ appareilId, secret, compagnieId, gareId, libelle, agence, gare, genre, rang, plage }` (codes de 3 lettres). Le code sert une fois. |
| `GET /appareils/:id/commande`                            | public (secret de l'appareil)  | `{ commande: { id, type: "effacer", emiseA, secretAcquittement } \| null }`. Lu par `creerCanalHttp` de `apps/web/src/kiosque/canal.ts`.           |
| `POST /appareils/:id/commandes/:commandeId/acquittement` | public (secret d'acquittement) | Rapport `{ effaceA, complet, etapes[] }` ; 200, puis 409 `DEJA_ACQUITTEE` au second accusé.                                                        |

> La mission parlait de `POST /appareils/:id/acquittement`. La route livrée est celle que le client du kiosque appelle
> déjà (`…/commandes/:commandeId/acquittement`, `canal.ts`) : l'accusé porte l'identifiant de l'ordre dans l'URL.

## Qui voit quoi

Le patron voit toute son agence. Le **superviseur** n'agit que sur les lignes dont l'origine est sa gare, les départs
de ces lignes et les appareils de sa gare (403 `HORS_PERIMETRE` sinon). Un compte sans agence reçoit 403
`AGENCE_REQUISE`. Aucune route ne traverse deux agences : une ligne, un bus, un départ ou un appareil d'une autre
agence répond 404.

## Règles métier

| Règle                                                                                                                                                                                                                                                                                                                                                                                                                                              | Où                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Une ligne = deux gares de l'agence, unique par couple (409 `LIGNE_EXISTANTE`). Origine et terminus sont ses deux premières gares ; les arrêts en route sont donnés par leur nom.                                                                                                                                                                                                                                                                   | `lignes.service.ts`                                                          |
| **Le prix d'un départ vient du tarif de sa classe** (`tarifs.classique` / `tarifs.vip`) : le `prix` reçu dans `DepartEditable` est ignoré, celui renvoyé est recalculé.                                                                                                                                                                                                                                                                            | `lignes.service.ts` (`vue`)                                                  |
| Un horaire récurrent = heure `HH:MM`, classe, actif, note, jours de circulation (vide = tous les jours). **Un seul horaire actif par ligne et par heure** : le numéro d'un départ n'a pas de classe (garanti aussi en base).                                                                                                                                                                                                                       | `regles.ts`, migration `garanties`                                           |
| Publier avec `effetDu` futur (**90 jours au plus**, sinon 422 `EFFET_TROP_LOIN`) **n'écrit rien** dans la billetterie : les sections modifiées restent en brouillon. Elles s'appliquent à la première lecture ou génération de ce jour-là, et le `PlanificateurLignes` (`ADMIN_BALAYAGE_MS`) balaie les brouillons échus. Un brouillon qui ne peut plus s'appliquer est abandonné et tracé (`ligne.brouillon_applique`, refus).                    | `lignes.service.ts` (`appliquerSiEchu`, `balayerEchues`), `planificateur.ts` |
| Une commande de modification sans aucune section : 422 `COMMANDE_VIDE`. Plan de sièges cohérent : `(rangées − 1) × sièges par rangée ≤ capacité ≤ rangées × sièges par rangée` (422 `PLAN_INCOHERENT`). Un horaire cité deux fois dans la même commande : 422 `HORAIRE_CITE_DEUX_FOIS`. Bornes : capacité 200 places, 100 rangées, note de départ 120 caractères, 40 arrêts. Les refus métier sont tracés au journal comme les refus de signature. | `regles.ts`, `schemas.ts`, `lignes.service.ts`                               |
| Génération : pour chaque jour de `du` à `au` (62 jours au plus, 5 000 départs au plus), chaque horaire actif qui circule ce jour-là, à une heure encore à venir. Numéro `AGENCE-LIGNE-AAMMJJ-HHMM` ; **rejouable** (un numéro existant est compté, pas dupliqué).                                                                                                                                                                                  | `departs.service.ts`                                                         |
| Un départ généré est « en vente » (ou « programmé » avec `ouvrirVente: false`).                                                                                                                                                                                                                                                                                                                                                                    | `departs.service.ts`                                                         |
| Bus, chauffeur et convoyeur d'un départ : de l'agence, avec le bon rôle, **jamais pris par un autre départ qui chevauche** (durée de la ligne, 4 h si elle n'en a pas). Un départ arrivé, annulé ou fusionné libère ; un départ parti retient jusqu'à son arrivée. Contrôle et écriture sont atomiques (verrou consultatif).                                                                                                                       | `regles.ts`, `postgres.ts`                                                   |
| Pas de changement de bus sur un départ qui a des billets vendus (409 `BILLETS_VENDUS`) ; pas d'équipage sur un départ parti, arrivé ou annulé (409 `DEPART_CLOS`).                                                                                                                                                                                                                                                                                 | `departs.service.ts`                                                         |
| **Rang des appareils** : un guichet est le 1, 2 ou 3 de sa gare (plages 0001–0999, 1001–1999, 2001–2999) ; les convoyeurs d'une gare se partagent 3001–3999 (même nombre pour tous, un rang chacun). Deux appareils en service ne partagent jamais un rang (409 `RANG_PRIS`).                                                                                                                                                                      | `appareils.service.ts`                                                       |
| Chaque écriture sur une ligne ou un appareil est **signée par le PIN** du compte connecté (mêmes compteurs et blocage que la connexion, voir `modules/README.md`).                                                                                                                                                                                                                                                                                 | `modules/signature.ts`                                                       |
| Tout est tracé au journal d'audit (`ligne.*`, `depart.*`, `bus.*`, `appareil.*`), **refus de signature compris**. Ni code d'enrôlement, ni secret, ni PIN n'y entrent.                                                                                                                                                                                                                                                                             | `*.service.ts`                                                               |

## Enrôlement et effacement à distance

1. L'administrateur **déclare** l'appareil : fiche de synchronisation (genre, rang, gare) et **code** `XXXXX-XXXXX`
   (50 bits, sans I, L, O, 0, 1), valable 24 h, montré une seule fois. Seule son empreinte (HMAC avec la clé d'index
   aveugle) est gardée.
2. Le téléphone échange le code contre un **secret d'appareil** (`apd_…`, 256 bits ; seule son empreinte SHA-256 est
   gardée). Un code sert une fois ; de deux téléphones qui le présentent ensemble, la base n'en laisse passer qu'un.
3. Le téléphone interroge `GET /appareils/:id/commande` toutes les 30 s avec `Authorization: Bearer <secret>`.
4. L'administrateur émet l'ordre `effacer` (un seul ordre en attente par appareil, garanti par la base). L'appareil le lit
   avec un **secret d'acquittement** calculé (HMAC de l'appareil et de l'ordre) : après l'effacement il n'a plus ni
   session ni clé, c'est sa seule preuve.
5. L'appareil acquitte (une fois : l'accusé est écrit en ajout seul, un déclencheur refuse toute autre modification). Le
   serveur **révoque alors son secret** et le retire de la synchronisation : un téléphone effacé ne repart pas sans
   nouvelle déclaration.

**Côté web** (mode http, `apps/web/src/agent/` et `apps/web/src/ecrans/ConnexionAgent/`) : l'écran de connexion des
agents (lien « Je fais partie de l'équipe AfriMove » sous la connexion des voyageurs, ou `/connexion?agent=1`, ou
d'office sur un téléphone déjà enrôlé) enrôle le téléphone avec le code, puis connecte par PIN
(`/auth/guichet/connexion`) ou par mot de passe et code SMS (`/auth/direction/*`). La réponse de l'enrôlement porte les
codes de 3 lettres de l'agence et de la gare, le genre, le rang et la plage de numéros, dont le web compose
`afrimove.appareil` (avec le compte lu par `GET /me`). `KiosqueHttp` (monté dans `app.tsx`) surveille les ordres.

Un téléphone de secours : `POST /admin/appareils/:id/code` donne un nouveau code ; en s'enrôlant, le nouveau secret
remplace l'ancien (l'ancien téléphone ne lit plus rien).

## Erreurs (corps `{ statusCode, code, message }`, le client lit `code`)

| Statut | `code`                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `PIN_REQUIS`, `COMPTE_INACTIF`, `APPAREIL_NON_AUTHENTIFIE`, `SECRET_ACQUITTEMENT_INVALIDE`                                                                                                                                                                                                                                                                                                           |
| 403    | `PIN_INCORRECT`, `AGENCE_REQUISE`, `HORS_PERIMETRE`                                                                                                                                                                                                                                                                                                                                                  |
| 404    | `LIGNE_INCONNUE`, `HORAIRE_INCONNU`, `GARE_INCONNUE`, `BUS_INCONNU`, `DEPART_INCONNU`, `PERSONNE_INCONNUE`, `APPAREIL_INCONNU`, `COMMANDE_INCONNUE`, `CODE_INCONNU`, `AGENCE_INCONNUE`                                                                                                                                                                                                               |
| 409    | `LIGNE_EXISTANTE`, `BUS_EXISTANT`, `BUS_AFFECTE`, `DEPART_EXISTANT`, `DEPART_CLOS`, `BILLETS_VENDUS`, `RESSOURCE_OCCUPEE`, `RANG_PRIS`, `NB_CONVOYEURS_DIFFERENT`, `APPAREIL_RETIRE`, `APPAREIL_NON_ENROLE`, `EFFACEMENT_EN_COURS`, `DEJA_ACQUITTEE`, `PIN_NON_DEFINI`                                                                                                                               |
| 410    | `CODE_EXPIRE`                                                                                                                                                                                                                                                                                                                                                                                        |
| 422    | `COMMANDE_INVALIDE`, `COMMANDE_VIDE`, `EFFET_TROP_LOIN`, `HORAIRE_CITE_DEUX_FOIS`, `SIGNATURE_PERIMEE`, `GARES_IDENTIQUES`, `ARRET_EN_DOUBLE`, `HORAIRE_EN_DOUBLE`, `PLAN_INCOHERENT`, `HEURE_PASSEE`, `JOUR_INVALIDE`, `JOUR_PASSE`, `PERIODE_INVALIDE`, `PERIODE_TROP_LONGUE`, `TROP_DE_DEPARTS`, `ROLE_INCOMPATIBLE`, `RANG_INVALIDE`, `RANG_REQUIS`, `NB_CONVOYEURS_REQUIS`, `APPAREIL_INVALIDE` |
| 423    | `PIN_BLOQUE`                                                                                                                                                                                                                                                                                                                                                                                         |

## Stockage

Ports (`ports.ts`) : `AnnuaireAdmin`, `Lignes`, `ParcBus`, `Programme`, `RegistreAppareils`, `OrdresAppareils`. Adaptateurs en
mémoire (`memoire.ts`, tests et développement) et PostgreSQL (`postgres.ts`), choisis par `API_STOCKAGE` ; en production
`VerificationStockageAdministration` refuse de démarrer sur un port en mémoire.

| Table                 | Contenu                                                                                                                                                                                                                                | Migration                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `horaire_ligne`       | Horaires récurrents d'une ligne (heure, classe, actif, note, jours).                                                                                                                                                                   | `20261018001000_lot_de_administration` |
| `reglage_ligne`       | Plan de sièges, options (vente en ligne, fusion) et brouillon programmé d'une ligne.                                                                                                                                                   | idem                                   |
| `enrolement_appareil` | Appareil déclaré : code (empreinte) et échéance, secret (empreinte), enrôlé à, gare, libellé.                                                                                                                                          | idem                                   |
| `commande_appareil`   | Ordres envoyés aux appareils (effacement) et leur accusé.                                                                                                                                                                              | idem                                   |
| garanties SQL         | Heure et jours valides, un horaire actif par ligne et par heure, brouillon et jour d'effet liés, code d'enrôlement unique, un ordre en attente par appareil et par type, accusé écrit une fois (déclencheur), ordres non supprimables. | `20261018001010_lot_de_garanties`      |

Les départs, bus, lignes et arrêts sont les tables existantes (`depart`, `bus`, `ligne`, `arret`) ; les appareils
sont ceux de `appareil_sync` (synchronisation). Verrou consultatif : `pg_advisory_xact_lock(7_017_093, hashtext(…))`
(`ligne:<id>`, `depart:<compagnie>`, `appareil:<compagnie>`).

## Règles provisoires (à confirmer par l'agence)

- Le contrat de création d'une ligne ne porte **ni kilomètres ni durée** : les arrêts sont répartis à 100 km d'intervalle
  et la durée vaut 0 (donc 4 h pour les conflits d'équipage). Les prix de tronçon sont proportionnels au nombre
  d'arrêts jusqu'à ce que des kilomètres soient connus. Aucune route ne modifie encore ces distances.
- Plan de sièges d'une ligne créée : disposition « 2+2 » et capacité demandée.
- Un code d'enrôlement vaut 24 heures ; un appareil effacé est retiré du service (nouvelle déclaration pour le
  remettre en route) ; un appareil retiré ne peut pas recevoir de nouveau code.
- Une génération est limitée à 62 jours et 5 000 départs.
- Un chauffeur ou un convoyeur est affecté sans contrôle de ses jours de repos (pas de planning dans l'API).

## Tests

`regles.test.ts` (calendrier, arrêts, conflits, plan de sièges), `administration.e2e.test.ts` et
`appareils.e2e.test.ts` (HTTP sur la mémoire, dont le **vrai client HTTP du kiosque** `apps/web/src/kiosque/canal.ts`
contre l'API ; bornes, « dès lundi », balayage, 409 `LIGNE_EXISTANTE`), `parite.test.ts` (zod et api-client),
`administration.module.test.ts` (garde-fou de production, configuration du balayage),
`postgres.integration.test.ts` (conditionné par `DATABASE_URL_TEST` : contrat des ports sur la mémoire et PostgreSQL,
garanties de la base, réglages de ligne sur PostgreSQL, API entière sur PostgreSQL, redémarrage compris). Suite de
contrat : `testing/contrat-ports.ts`.

## Variable d'environnement

`ADMIN_BALAYAGE_MS` (300000 par défaut, 0 en test ou pour désactiver) : fréquence à laquelle `PlanificateurLignes`
met en vigueur les modifications de ligne « dès lundi » dont le jour est venu. Sans lui, la modification est aussi
appliquée à la prochaine lecture de la ligne. (Elle remplace `PATRON_BALAYAGE_MS` du lot Da.)
