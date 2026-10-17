# Contrats d'API · espace patron (AM-016)

Schémas zod et types de l'espace patron (`@afrimove/contrats` → `patron`), et les hooks qui les servent
(`@afrimove/api-client` → `patron`). Les écrans ne connaissent que ces hooks et ces types : en mock
comme en HTTP, rien ne change dans l'écran.

```tsx
import { patron } from "@afrimove/api-client";

function Aujourdhui() {
  const { data, isPending, error } = patron.useTableauDuJour();
  const direct = patron.useDirectJour(); // temps réel : chiffres et alertes
  // data.jour.recette est un entier de FCFA (2 610 000), data.instant un ISO Africa/Douala.
}
```

## Conventions

- **Montants** : entiers de FCFA (`z.number().int()`), signés pour les écarts (`-1000`). Jamais de « 2,61 M » :
  c'est l'écran qui met en forme.
- **Heures** : ISO 8601 en Africa/Douala (`2027-01-05T14:05:00.000+01:00`). Les jours sont `AAAA-MM-JJ`, les mois
  comptables `AAAA-MM`, les heures de départ récurrentes `HH:MM`.
- **Schémas stricts** (`z.strictObject`) : un champ inconnu est une erreur de contrat, pas un oubli silencieux.
- **Identifiants** : ceux du domaine (`@afrimove/domain`) : `ligne-alp-dlabaf`, `kamga`, `bus-…`.
- **Textes** : l'API renvoie des valeurs, jamais de la mise en forme. Quelques phrases déjà formulées
  (`indicateur`, `lecture`, `explication`, `texte`) restent des textes de l'API.

## Toute modification de réglage exige une signature PIN

Chaque écriture du patron est déclarée avec `commandeSignee({ … })` (`commun.ts`) : le corps porte une
`signature` **obligatoire** :

```ts
{ pin: "483920", methode: "pin" | "empreinte", signeA: "2027-01-05T14:07:00.000+01:00" }
```

- PIN à 6 chiffres, instant ISO Douala, aucun champ en trop. L'API vérifie le PIN, date, signe et ajoute
  l'écriture au journal (`AccuseSigne` : `journalId`, `signeA`, `signePar`). Le PIN n'est jamais renvoyé.
- `COMMANDES_REGLAGES` (lignes, personnes, règles, comptes MoMo, modules, propositions de l'assistant) et
  `COMMANDES_FINANCIERES` (rapprochement, clôture, financement, paie) listent toutes les écritures ; leur union
  est `COMMANDES_SIGNEES`. `commandes.test.ts` parcourt ce registre : sans signature, avec un PIN mal formé ou
  hors fuseau, le contrat refuse chaque commande.
- Côté `api-client`, `OPERATIONS_SIGNEES` a exactement les mêmes clés (testé), et le mock répond `401 PIN_REQUIS`
  à un corps sans signature, `403 PIN_INCORRECT` pour le PIN `000000`, `422 COMMANDE_INVALIDE` pour un corps
  incomplet.
- `patron.useSignaturePin()` fabrique la signature à partir du PIN saisi avec l'horloge du client (jamais celle de
  l'écran) : `const signer = useSignaturePin(); mutation.mutate({ …, signature: signer(pin) })`.

## Écran → hooks

Les noms de planche sont ceux de `@afrimove/fixtures` (`ecrans.<Planche>`) ; un scénario du même nom fait
renvoyer à ces hooks exactement les valeurs de la planche (un test par planche : `planches.test.tsx`).
Après une écriture, les lectures concernées sont rechargées automatiquement.

| Planche (scénario)       | Route                                       | Lectures et temps réel                                   | Écritures (toutes signées par le PIN)                                                               |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Patron`                 | `/(patron)/aujourdhui`                      | `useTableauDuJour`, `useAlertes`, `useDirectJour` (flux) |                                                                                                     |
| `PatronEquipe`           | `/(patron)/gares`                           | `useGares`                                               | `useLancerPaie`                                                                                     |
| `PatronGare`             | `/(patron)/gares/[gareId]`                  | `useGare(gareId)`                                        |                                                                                                     |
| `PatronPersonne`         | `/(patron)/personnes/[personneId]`          | `useFichePersonne(personneId)`                           |                                                                                                     |
| `RapportSoir`            | `/(patron)/rapport`                         | `useRapportSoir({ jour? })`                              |                                                                                                     |
| `Analyses`               | `/(patron)/analyses`                        | `useAnalyses(periode)`                                   |                                                                                                     |
| `AnalysesLigne`          | `/(patron)/analyses/ligne/[ligneId]`        | `useAnalyseLigne(ligneId, periode?)`                     |                                                                                                     |
| `AnalysesBus`            | `/(patron)/analyses/bus/[busId]`            | `useAnalyseBus(busId)`                                   |                                                                                                     |
| `Assistant`              | `/(patron)/assistant`                       | `useInsightsAssistant`                                   | `useAppliquerProposition` (décaler un départ, contrôle inopiné…) ; `useSimuler` (sans PIN, lecture) |
| `AssistantReponse`       | `/(patron)/assistant/reponse`               | `useConversationAssistant`                               | `usePoserQuestion` (sans PIN : ne change rien), `useSimuler`, `useAppliquerProposition`             |
| `Comptable`              | `/(patron)/comptable`                       | `useSyntheseComptable({ mois? })`                        | `useCloturerMois`                                                                                   |
| `ComptableRapprochement` | `/(patron)/comptable/rapprochement`         | `useRapprochementMomo({ mois? })`                        | `useAppliquerRapprochement`                                                                         |
| `ComptableApercu`        | `/(patron)/comptable/apercu/[exportId]`     | `useApercuExport(exportId, mois?)`                       |                                                                                                     |
| `ComptableCloture`       | `/(patron)/comptable/cloture`               | `useClotureMois({ mois? })`                              | `useCloturerMois`                                                                                   |
| `Config`                 | `/(patron)/reglages`                        | `useReglages`                                            |                                                                                                     |
| `ConfigLigne`            | `/(patron)/reglages/ligne/[ligneId]`        | `useLigneEditable(ligneId)`                              | `useModifierLigne` (départs, tarifs, arrêts, plan de sièges), `useCreerLigne`                       |
| `ConfigPersonne`         | `/(patron)/reglages/personne/[personneId]`  | `usePersonneEditable(personneId)`                        | `useModifierPersonne`, `useCreerPersonne`, `useDesactiverPersonne`, `useNouveauPinProvisoire`       |
| `ConfigRegles`           | `/(patron)/reglages/regles`                 | `useRegles`                                              | `useEnregistrerRegles`, `useDemanderConfirmationCompteMomo` puis `useChangerCompteMomo`             |
| `ConfigEquipeListe`      | `/(patron)/reglages/equipe`                 | `useEquipe({ role?, recherche?, gareId? })`              |                                                                                                     |
| `Modules`                | `/(patron)/reglages/modules`                | `useModules`                                             | `useChangerModule` (agence, gare ou ville)                                                          |
| `Financement`            | `/(patron)/financement`                     | `useOffreFinancement`                                    | `useDemanderAvance`, `useLancerPaie`                                                                |
| `FinancementDemande`     | `/(patron)/financement/demande/[dossierId]` | `useDossierFinancement(dossierId)`                       | `useRetirerDemande`                                                                                 |
| `InterAgences`           | `/(patron)/inter-agences`                   | `useInterAgences`                                        |                                                                                                     |
| `InterAgencesConvention` | `/(patron)/inter-agences/convention/[id]`   | `useConventionInterAgences(conventionId)`                |                                                                                                     |
| `Controle`               | `/controle`                                 | `useSalleDeControle`, `useDirectControle` (flux)         |                                                                                                     |

Hooks transverses : `useSignaturePin`. Chaque hook correspond à une opération (`OP_…`) ou un canal (`CANAL_…`)
de `packages/api-client/src/patron/operations.ts` (nom `patron.<groupe>.<action>`, chemin `/patron/…`).

## Mock : `installerMockPatron(scenario, donneesScenario)`

Exportée par `@afrimove/api-client` (`patron.installerMockPatron`), elle sert le futur composeur central de
scénarios (un par domaine : voyageur, colis, agence, patron…).

```ts
import { ecrans } from "@afrimove/fixtures";
import { patron } from "@afrimove/api-client";

const source: SourceScenarios = {
  noms: () => ["defaut", ...NOMS_PLANCHES],
  instantInitial: (nom) => ecrans[nom]?.maintenant, // l'heure de la planche, 14:05 pour « Patron »
  charger: (nom) => {
    const patronMock = patron.installerMockPatron(nom, ecrans[nom]);
    return {
      nom,
      operations: [...patronMock.operations /* , …autres domaines */],
      flux: [...patronMock.flux /* , …autres domaines */],
    };
  },
};
```

**Contrat :**

- `scenario` : le nom du scénario demandé (`?scenario=`), une planche ou « defaut ».
- `donneesScenario` : le scénario de `@afrimove/fixtures` chargé pour ce nom (`ecrans[scenario]`), ou
  `undefined`. Il **prime** pour sa propre planche ; toutes les autres planches patron viennent des fixtures.
  Ainsi un scénario de planche (ou « defaut ») répond à _tous_ les écrans patron : on peut naviguer de l'accueil
  aux réglages sans backend.
- Retour : `{ operations: ImplementationMock[]; flux: FluxMock[] }`, à concaténer au `Scenario` du client mock.
  Les opérations déjà implémentées par un autre domaine ne sont pas touchées : les noms patron commencent par
  `patron.` (et le canal `controle.direct`).
- **Un état neuf par appel** (modules, règles, ligne, personnes, rapprochement, clôture, dossiers) : à appeler
  dans `SourceScenarios.charger`, qui renvoie une instance par client. Une écriture signée modifie cet état
  et la lecture suivante la reflète.
- Pas d'effet de bord, aucun accès réseau, aucune horloge système : le temps réel passe par l'horloge du client.
- Si `scenario` est une planche d'un autre espace, le monde patron est quand même installé (comme « defaut »).
  `PLANCHES_PATRON` et `estPlancheMockPatron(nom)` listent les 25 planches patron.

**Les valeurs du mock** viennent des textes des planches (`« 2,61 M »`, `« − 14 % »`, `« 15 déc. 14:00 »`) convertis en
entiers de FCFA, pourcentages et ISO Douala (`mock/lecture.ts`, testé). Ce que la maquette ne chiffre pas est
déduit ou laissé `null`, jamais inventé en silence :

- Les séries en barres (recette par jour, net par semaine, ventes par heure) reçoivent des montants **au prorata de
  la hauteur des barres**, de sorte que la somme est exactement le total affiché.
- Ce que la planche ne montre que sous une forme relative (« hier » → hier 18:00) est daté au plus simple.
- `coutTotalPct`, `partenaire` (convention non signée), `ecartTotal` d'une gare hors ligne, `total` de la paie
  sont `null` : la maquette garde un crochet ou ne les donne pas.
- Seules les périodes et fiches que les planches contiennent existent : `useAnalyses("mois")` répond
  `404 PERIODE_INDISPONIBLE`, une ligne, un bus, une personne, un dossier ou un export sans planche répondent `404`
  (`LIGNE_INCONNUE`, `BUS_INCONNU`, `PERSONNE_INCONNUE`, `DOSSIER_INCONNU`, `APERCU_INDISPONIBLE`). Les gares sans
  planche de détail (Mvan, Bafoussam) répondent avec ce que « Mes gares » en sait.
- Le temps réel part des chiffres de la planche puis ajoute une vente de 4 000 F toutes les 30 s sur l'horloge
  injectée (`useDirectJour`, `useDirectControle`).
- Quand deux planches se contredisent (voir `packages/fixtures/INCOHERENCES.md`), chaque hook renvoie la valeur de
  sa propre planche.

## Tests

```sh
pnpm --filter @afrimove/contrats run typecheck   # puis test, lint
pnpm --filter @afrimove/api-client run typecheck # puis test, lint
```

- `contrats/…/commandes.test.ts` : signature PIN obligatoire sur chacune des 16 écritures.
- `api-client/…/planches.test.tsx` : un test par planche patron + la salle de contrôle.
- `api-client/…/ecritures.test.tsx` : écritures signées de bout en bout, rechargement des lectures, temps réel.
- `api-client/…/operations.test.ts`, `installer.test.ts`, `mock/lecture.test.ts` : registre des opérations,
  contrat de `installerMockPatron`, lecture des textes.
