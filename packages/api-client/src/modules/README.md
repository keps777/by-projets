# Client des modules (AM-126)

Ce que les apps (voyageur, guichet, patron) utilisent pour savoir quels modules afficher, et le mock qui
va avec. Le moteur côté serveur est dans `apps/api/src/modules/` (routes, règles, tables).

| Export                                               | Rôle                                                                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useModule(idOuCode, contexte?)`                     | `boolean` : le module est-il actif ? Même forme que `useModule(id)` de la coquille web. Accepte l'identifiant web (`"covoit"`) ou le code API (`"covoit_vendeurs"`).  |
| `useModulesMasques(contexte?)`                       | Les modules masqués, **en identifiants web** : la liste attendue par `<ModulesProvider masques>` et `construireRoutes(sources, masques)`. Le socle n'y figure jamais. |
| `useModulesActifs(contexte?)`                        | La lecture brute (`GET /modules/actifs`) : `{ agenceId, gareId, ville, calculeA, modules: [{ code, actif }] }`.                                                       |
| `useChangerModule()`                                 | Allume ou masque un module (patron, signé par le PIN) **et** recharge les menus. À préférer à `patron.useChangerModule` sur l'écran « Modules ».                      |
| `OP_MODULES_ACTIFS`, `ModulesActifsSchema`           | L'opération et son schéma zod. Le réglage (`OP_MODULES`, `OP_CHANGER_MODULE`) reste dans le client patron.                                                            |
| `CATALOGUE_MODULES`, `codeDuModule`, `idWebDuModule` | Les 12 modules, leurs codes API et leurs identifiants web.                                                                                                            |
| `installerMockModules(options?)`                     | Le mock : mêmes règles que l'API, état partagé entre la lecture du patron et les modules visibles.                                                                    |

`contexte` = `{ agence?, gare?, ville? }`. Tout est facultatif : le serveur déduit l'agence et la gare du
compte connecté. Un voyageur nomme l'agence (`agence`) et, s'il parcourt une ville, la ville ; un compte
d'agence ne peut lire que la sienne.

## Comportement

- Rafraîchissement : au chargement, au retour sur l'onglet et à la reconnexion (« au prochain
  rafraîchissement »). Le patron qui masque un module voit ses propres menus changer tout de suite
  (`useChangerModule`).
- **Rien ne disparaît par accident** : tant que la première réponse n'est pas arrivée, ou si le serveur ne
  répond pas, tout est affiché ; une fois l'état connu, la dernière valeur reste en place même si un
  rafraîchissement échoue. Un guichet hors ligne ne perd donc jamais une fonction.
- Un identifiant inconnu (`useModule("covoiturage")`) lève une erreur : une faute de frappe ne doit pas
  laisser passer un module masqué.

## Brancher la coquille web (hors périmètre : `apps/web/src/coquille/**`)

La coquille a déjà son mécanisme (`ModulesProvider`, `useModule`, `construireRoutes(sources, masques)`,
`?modules-masques=` en démonstration). Rien n'est à y modifier : il suffit de lui fournir la liste des
modules masqués depuis l'API.

1. Exporter le client : dans `packages/api-client/src/index.ts`, ajouter
   `export * as modules from "./modules/index";`.
2. À la racine de l'app, sous le `FournisseurApi` (les routes sont construites une fois, donc il faut
   connaître les modules masqués **avant** de construire le routeur) :

```tsx
import { modules } from "@afrimove/api-client";

function AppAvecModules() {
  const lecture = modules.useModulesActifs(); // gare du compte ; { agence } pour un voyageur
  const masquesApi = modules.useModulesMasques();
  const { modulesMasques: masquesDemo } = useParametresDemo(); // ?modules-masques= (mode démo)
  const masques = useMemo(
    () => [...new Set([...masquesDemo, ...masquesApi])],
    [masquesDemo, masquesApi],
  );
  const routeur = useMemo(() => createBrowserRouter(construireRoutes(sources, masques)), [masques]);
  if (lecture.isPending) return <Chargement />; // pas de route masquée ouverte avant la réponse
  return (
    <ModulesProvider masques={masques}>
      <RouterProvider router={routeur} />
    </ModulesProvider>
  );
}
```

3. `ModulesProvider` fournit déjà à `useModule(id)` de la coquille la valeur du client : rien d'autre à
   changer. Un écran qui veut lire un module précis peut aussi appeler `modules.useModule("covoit")`.
4. En voyageur non connecté, passer `{ agence }` à `useModulesActifs` (la route exige un compte connecté ;
   voir les points à confirmer).
5. En mode `mock`, ajouter `installerMockModules()` **avant** `installerMockPatron(...)` dans les
   `operations` du scénario : le client mock retient la première implémentation d'une opération, le mock
   des modules remplace celui du patron et partage son état avec `modules.actifs`.

```ts
const modulesMock = modules.installerMockModules({ gareParDefaut: gareDuCompte });
const patronMock = installerMockPatron(nom, donneesScenario);
return {
  nom,
  operations: [...modulesMock.operations, ...patronMock.operations],
  flux: patronMock.flux,
};
```

## Tests

`pnpm --filter @afrimove/api-client run test` : `modules.test.tsx` (catalogue identique aux fixtures et à la
coquille web ; adaptateur HTTP ; `useModule`, `useModulesMasques` et leur repli ; masquer un module met les
menus à jour ; exceptions par gare ; mock : socle, PIN, erreurs, priorités, remise à plat, état neuf par
client). La parité avec les règles de l'API est vérifiée côté API (`apps/api/src/modules/parite.test.ts`).
