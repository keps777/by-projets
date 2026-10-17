# Moteur des modules (AM-126)

Les 12 modules d'AfriMove s'allument ou se masquent sans développeur, **par agence, par gare et par ville**
(planche « Modules », `/(patron)/reglages/modules`). Un module masqué disparaît de toutes les apps (pas de
bouton grisé, pas de « bientôt »), **sans perte de données** : seule la visibilité change.

Aucune dépendance au domaine ni aux contrats à l'exécution (paquets non compilés, API en CommonJS) : les
règles sont recopiées, et **`parite.test.ts` les compare** au catalogue et aux règles du client d'API, aux
schémas zod de `@afrimove/contrats` et à `@afrimove/domain`.

## Règles métier

| Règle                                                                                                                                                                                                                  | Où                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 12 modules fixes (`catalogue.ts`). `guichet_caisse` est le **socle** : jamais masqué, à aucune portée (409 `MODULE_SOCLE`, même si la base dit le contraire).                                                          | `catalogue.ts`, `portee.ts`        |
| L'agence pose une règle générale par module ; sans règle, l'état par défaut du catalogue s'applique (tout actif, sauf `covoit_vendeurs` et `financement`).                                                             | `portee.ts` (`etatAgence`)         |
| Exceptions par **gare** ou par **ville**. Priorité : gare, puis ville, puis agence.                                                                                                                                    | `portee.ts` (`etatDans`)           |
| Régler « toute l'agence » **remet à plat** les exceptions du module.                                                                                                                                                   | `ReglagesModules.definirAgence`    |
| Régler une gare ou une ville à la valeur dont elle hérite **retire** son exception (elle suit de nouveau la règle du dessus) : sans cela les exceptions s'accumuleraient (le contrat n'a pas d'opération « retirer »). | `modules.service.ts` (`appliquer`) |
| Une ville est reconnue sans accents ni casse (`yaounde` = `Yaoundé`) et doit avoir au moins une gare dans l'agence (404 `VILLE_INCONNUE`). Une gare doit être à l'agence (404 `GARE_INCONNUE`).                        | `modules.service.ts`               |
| Chaque changement, **accepté ou refusé**, entre au journal d'audit (`module.changer`, cible `module`).                                                                                                                 | `modules.service.ts`               |
| Toute écriture est signée par le PIN du patron connecté (voir « Signature PIN »).                                                                                                                                      | `signature.ts`                     |

## Routes

| Route                       | Rôles                | Rôle de la route                                                                                                                                                                                                                  |
| --------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /patron/modules`       | patron               | `ModulesAgence` (contrats patron) : les 12 modules de l'agence, leur règle générale et leurs exceptions.                                                                                                                          |
| `PUT /patron/modules/:code` | patron               | `ChangerModule` → `ModuleChange` (contrats patron). Corps : `{ code, actif, portee, signature }`.                                                                                                                                 |
| `GET /modules/actifs`       | tout compte connecté | **Ce que les apps affichent** : `{ agenceId, gareId, ville, calculeA, modules: [{ code, actif }] }`, vu de la gare du compte. Paramètres facultatifs : `agence` (voyageur, AfriMove), `gare`, `ville`. `Cache-Control: no-store`. |

Erreurs (corps `{ statusCode, code, message }`, le client lit `code`) :

| Statut | `code`                                                                     |
| ------ | -------------------------------------------------------------------------- |
| 401    | `PIN_REQUIS` (signature absente), `COMPTE_INACTIF`                         |
| 403    | `PIN_INCORRECT`, `AGENCE_INTERDITE`, `AGENCE_REQUISE` (compte sans agence) |
| 404    | `MODULE_INCONNU`, `GARE_INCONNUE`, `VILLE_INCONNUE`, `AGENCE_INCONNUE`     |
| 409    | `MODULE_SOCLE`, `PIN_NON_DEFINI`                                           |
| 422    | `COMMANDE_INVALIDE` (corps ou code d'URL incohérent), `SIGNATURE_PERIMEE`  |
| 423    | `PIN_BLOQUE`                                                               |

## Signature PIN

Le PIN signé est celui du **compte connecté** (`personne.pinHache`). Il compte comme un essai de
connexion : mêmes compteurs que `AuthService` (3 essais, puis 15 minutes de blocage). La date de
l'appareil (`signeA`) doit être à moins de 10 minutes de celle du serveur (une signature capturée ne se
rejoue pas) ; l'accusé renvoie l'heure **du serveur**. Le PIN n'est ni conservé ni journalisé
(l'audit ne garde que la façon de signer, `pin` ou `empreinte`, et l'heure déclarée par l'appareil).

> Un patron se connecte par mot de passe + SMS : `ComptesService.creer` ne lui pose **pas** de PIN. Tant que
> le compte n'a pas de `pinHache`, l'écriture répond 409 `PIN_NON_DEFINI`. Il faut donc donner un PIN aux
> comptes patron (création de compte, AM-120).

## Faire disparaître un module des autres routes de l'API

Les autres modules de l'API protègent leurs routes avec `@ModuleRequis` : si l'agence du compte a masqué le
module pour sa gare ou sa ville, la route répond **404 `MODULE_MASQUE`** comme si elle n'existait pas.

```ts
@Module({ imports: [ModulesModule] }) // exporte ModulesService et GardeModule
export class ColisModule {}

@Roles("guichetier", "patron")
@ModuleRequis("colis")
@Get("colis/:id")
lire() {}
```

`ModuleRequis` s'utilise avec `@Roles` ou `@Authentifie` (la garde lit le compte posé par
l'authentification). Un compte sans agence (voyageur) n'est pas filtré par la garde : ses routes nomment
l'agence, et le service qui les sert appelle `ModulesService.estActif(agenceId, "colis", { gareId, ville })`.

## Ports (ce que la base remplace)

Tout passe par des classes abstraites (`ports.ts`) ; `memoire.ts` en donne des versions en mémoire pour les
tests. `ModulesModule` **refuse de démarrer en production** tant que `ReglagesModules` ou `AnnuaireAgences`
est en mémoire.

| Port              | À fournir                                                                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReglagesModules` | `lire(agence)`, `definirAgence` (efface les exceptions, **une transaction**), `poserException` (upsert), `retirerException`. Chaque appel est atomique et ne touche qu'une ligne : deux réglages simultanés de deux gares se cumulent. |
| `AnnuaireAgences` | `agenceExiste(id)`, `gares(agence)` → `{ id, nom, ville }` : lecture des tables `compagnie` et `gare` du socle.                                                                                                                        |
| `DetailsModules`  | Facultatif. La phrase d'état de la planche (« Douala 12 · Bafoussam 6 ») que seul le module concerné sait écrire ; par défaut (`DetailsAucun`), une phrase générique.                                                                  |

## Tables PostgreSQL attendues (hors périmètre : `apps/api/prisma/**`)

- `module_compagnie` (**existe déjà** dans la migration initiale : `compagnieId`, `code`, `nom`, `actif`,
  clé `(compagnieId, code)`) : la règle générale de l'agence. Une ligne n'existe que si l'agence a réglé le
  module ; `nom` reçoit le nom du catalogue. Ajouter si on le souhaite une contrainte `CHECK` sur les 12 codes.
- `module_exception` (**à créer**) : `compagnie_id` (uuid, FK `compagnie`), `code` (texte), `portee_type`
  (`gare` | `ville`), `gare_id` (uuid, FK `gare`, nul pour une ville), `ville_cle` (clé de comparaison
  `cleVille` : sans accents, minuscule), `ville_nom` (écriture officielle), `actif` (booléen), `cree_a`,
  `cree_par` (uuid, FK `personne`). Unicité `(compagnie_id, code, portee_type, coalesce(gare_id::text, ville_cle))` ;
  `CHECK ((portee_type = 'gare') = (gare_id IS NOT NULL))`.
- Historique : le journal d'audit existant (`journal_audit`, action `module.changer`, `cible_type = 'module'`,
  `cible_id` = code) ; le patron le relit par `GET /patron/journal-audit`. Aucune table de plus.

Adaptateur `ReglagesModules` : `lire` = deux `SELECT` (agence + exceptions) ; `definirAgence` = `UPSERT
module_compagnie` + `DELETE module_exception WHERE (compagnie_id, code)` dans une transaction ;
`poserException` = `INSERT … ON CONFLICT DO UPDATE` ; `retirerException` = `DELETE`.

## À faire pour brancher le module (hors périmètre)

- importer `ModulesModule` dans `AppModule` (`apps/api/src/socle/app.module.ts`) et y remplacer
  `ReglagesModules` et `AnnuaireAgences` par les adaptateurs PostgreSQL ;
- créer la migration de `module_exception` ;
- donner un PIN aux comptes patron (voir « Signature PIN ») ;
- exporter `ModulesActifsSchema` dans `packages/contrats` (il vit pour l'instant dans
  `packages/api-client/src/modules/contrat.ts`) ;
- protéger les routes des autres modules avec `@ModuleRequis` au fur et à mesure de leur écriture.

## Tests

`pnpm --filter @afrimove/api run test` :

- `portee.test.ts` : catalogue, priorité gare > ville > agence, défaut, héritage, socle ;
- `modules.e2e.test.ts` (HTTP, gardes, audit, PIN) : accès par rôle, 12 modules au format des contrats,
  masquer un module le retire pour guichet, voyageur et patron, jamais pour une autre agence, socle
  intouchable à toute portée, exceptions par gare et par ville, remise à plat, réglages simultanés, PIN
  absent/faux/bloqué/périmé, corps invalides, une ligne d'audit par changement (acceptée ou refusée) sans
  le PIN et sans casser la chaîne, effet de `@ModuleRequis` sur une autre route ;
- `parite.test.ts` : catalogue et règles identiques à celles du client, routes et corps du client
  (`OP_MODULES`, `OP_CHANGER_MODULE`, `OP_MODULES_ACTIFS`) servis par l'API et validés par les schémas zod,
  heure de Douala identique au domaine ;
- `modules.module.test.ts` : refus de démarrer en production avec des ports en mémoire.

Le montage de test est `testing/app-modules-test.ts` (il importe `ModulesModule` à côté d'`AppModule`, sans
toucher au socle de test).
