# Infrastructure du client d'API (AM-012)

Une interface (`ClientApi`), deux adaptateurs, choisis par l'environnement. Les écrans ne
connaissent que les hooks et les contrats : ils n'importent jamais `fetch`, ni les fixtures.

## Choix de l'adaptateur

| Source                        | Effet                                                       |
| ----------------------------- | ----------------------------------------------------------- |
| `VITE_API_MODE=mock` (défaut) | adaptateur mock                                             |
| `VITE_API_MODE=http`          | adaptateur HTTP vers apps/api (`VITE_API_URL`, déf. `/api`) |
| `VITE_API_SCENARIO`           | scénario mock par défaut                                    |
| URL `?scenario=<nom>`         | scénario mock (prime sur la variable) : sert au banc        |
| URL `?horloge=<ISO>`          | l'horloge mock part de cet instant puis s'écoule            |
| URL `?horloge=gelee:<ISO>`    | l'horloge mock reste figée                                  |

```tsx
// main.tsx : seul endroit qui connaît l'adaptateur
const client = creerClientDepuisEnvironnement({ source: sourceDesFixtures });
<FournisseurApi client={client}>
  <App />
</FournisseurApi>;

// un écran
const departs = useRequete(OP_DEPARTS, { gare: "DLA" });
const reserver = useMutationApi(OP_RESERVER);
const { dernier, etat } = useFlux(CANAL_POSITION, { departId });
```

## Contrats

`definirOperation` (méthode, chemin, schéma zod de la réponse) et `definirCanal` (temps réel) se
déclarent une fois ; les deux adaptateurs les partagent. Toute réponse est validée par zod
(`ErreurValidation` sinon), en mock comme en HTTP. Voir `exemples.ts`.

## Mock

- `SourceScenarios` (`noms`, `charger`, `instantInitial?`) est injectée : l'application l'adosse à
  `@afrimove/fixtures`. Sans source, `sourceScenariosVide()` : tout répond `ErreurNonImplementee`.
- Un `Scenario` liste des `implementer(operation, fn)` et des `simulerFlux(canal, fn)` (temps réel
  simulé). `charger` renvoie un état neuf à chaque client.
- Latence simulée (`latenceMs`, 120 à 400 ms par défaut), aléa et horloge injectables.
- `creerHorlogeManuelle(...)` + `avancer(ms)` pilotent latence et flux dans les tests.

## HTTP

`fetch` injectable, `Authorization` via `obtenirJeton`, délai par tentative, relance avec
backoff exponentiel et gigue (statuts 408/425/429/5xx et pannes réseau, **uniquement** pour les
opérations `idempotente` ; `Retry-After` respecté), WebSocket avec reconnexion pour les canaux.

## Erreurs

Toutes héritent de `ErreurApi` (`genre`, `retentable`) : `ErreurReseau`, `ErreurDelai`,
`ErreurHttp` (`statut`, `code`, `details`), `ErreurValidation`, `ErreurAnnulee`,
`ErreurNonImplementee`, `ErreurScenarioInconnu`, `ErreurConfiguration`.
