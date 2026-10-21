# @afrimove/fixtures

Un monde commun cohérent et un scénario par planche de maquette (77 au total), validés contre `@afrimove/domain`. Les écrans, les tests et les démos de tous les packages partent de ces données plutôt que d'en inventer.

L'horloge est figée au **mardi 5 janvier 2027, 07:38, Africa/Douala** (`HORLOGE`).

## Utilisation

```ts
import { ecrans, HORLOGE, MONDE, problemes } from "@afrimove/fixtures";

const ecran = ecrans.Guichet; // un scénario par nom de planche (`NomPlanche`)
ecran.planche; // "Guichet"
ecran.horloge; // "2027-01-05T07:38:00.000+01:00"
ecran.maintenant; // l'instant que montre la planche (08:18 pour Guichet)
ecran.donnees; // exactement les valeurs affichées par la maquette
ecran.entites; // les objets du domaine derrière l'écran (départs, billets, colis, sessions…)
```

- `ecrans` est indexé par nom de planche (`Main`, `SiegePay`, `Pass`, `Caisse`, `PatronGare`…) ; la liste des noms est `NOMS_PLANCHES` et `PLANCHES` (`src/planches.ts`) donne pour chacune son titre, sa route et ses tickets. Le nom est celui du fichier `docs/maquettes-v3/<Planche>.dc.html`.
- `MONDE` est l'ensemble des entités communes (compagnies, gares, guichets, lignes, bus, personnes, modules, départs, billet d'Aïcha, colis de Maman, caisse de Joseph…). Les constantes sont aussi exportées une par une (`BILLET_AICHA`, `COLIS_MAMAN`, `SESSION_JOSEPH`, `DEPART_ALPHA_0830`…).
- `problemes(entites, MONDE)` renvoie la liste des problèmes de cohérence des entités du domaine par rapport au monde commun (voir `src/validation.ts`). Chaque scénario est validé au chargement : un scénario incohérent lève une erreur à l'import.
- `heure("08:30")`, `jourDecale(1)`, `nombre(7500)` (« 7 500 »), `francs(…)` : petits utilitaires d'horloge et de format pour écrire des valeurs comme sur la maquette.

## Écrire ou modifier un scénario

Un scénario est un fichier `src/ecrans/<Planche>.ts` qui exporte le résultat de `ecran({ … })` :

```ts
export const Caisse = ecran({
  planche: "Caisse",
  maintenant: "13:58", // instant de la planche, par défaut l'horloge figée
  donnees: { … },      // les valeurs affichées, telles que la maquette les écrit
  copie: { … },        // textes fixes de la planche qui portent des chiffres ou des noms
  visuel: { … },       // barres, grilles de sièges, interrupteurs : non comparés au texte
  entites: { sessions: [SESSION_JOSEPH] },
  ignorer: [ … ],      // jetons numériques volontairement non modélisés (raison en commentaire)
});
```

Règles :

1. **Fidélité.** Chaque chaîne et chaque nombre de `donnees` doit se retrouver tel quel sur la planche, et chaque nombre significatif de la planche doit être couvert par `donnees`, `copie`, `visuel` ou `ignorer` (tests génériques de `src/ecrans.test.ts`).
2. **Clés en `_`.** Une clé qui commence par `_` (`_billetId`, `_decisionDomaine`, `_statutDomaine`…) est une référence ou une valeur dérivée du domaine qui n'est pas affichée ; les tests l'ignorent.
3. **Le domaine fait foi pour les calculs.** Les écarts de caisse, prorata, décisions d'annulation, répartitions relais/livreur et statuts d'appareil sont calculés avec les fonctions de `@afrimove/domain`, pas écrits à la main, puis comparés à la planche.
4. **Planches voisines.** Les planches qui montrent le même objet (par exemple `Caisse`, `SuperviseurValider` et `PatronGare` pour la caisse de Joseph) partagent des helpers de `src/partage/` : `caisse.ts`, `analyses.ts`, `comptable.ts`, `equipe.ts`, `colisMaman.ts`, `ligneDlaBaf.ts`, `alpha0830.ts`, `cadence.ts`.
5. **Pas de correction silencieuse.** Quand deux planches se contredisent, chacune garde sa valeur et l'écart est consigné dans [`INCOHERENCES.md`](./INCOHERENCES.md).
6. **Valeurs de complétion.** Quand le domaine exige un champ que la planche ne montre pas, on invente une valeur plausible dans `entites` ou dans une clé `_` (jamais dans `donnees`).

## Tests

```sh
pnpm --filter @afrimove/fixtures run typecheck
pnpm --filter @afrimove/fixtures run test
pnpm --filter @afrimove/fixtures run lint
```

- `src/ecrans.test.ts` : chaque planche a son scénario, passe la validation du domaine, ne contient que des valeurs présentes sur la planche et couvre ses nombres.
- `src/valeurs-cles.test.ts` : une centaine de valeurs relues à la main (7 500 F du billet VIP, caisse de Joseph 695 500 / 694 500 / − 1 000, 1 412 000 de la gare d'Akwa, 28 414 000 de décembre…) et leur cohérence avec le domaine.
- `src/monde.test.ts` : horloge figée, formats, monde commun valide, billet d'Aïcha, colis de Maman, codes de retrait vérifiables.
- Outil de relecture (désactivé par défaut) : `RAPPORT=Caisse,Guichet pnpm --filter @afrimove/fixtures exec vitest run src/testing/rapport.test.ts` liste, pour les planches demandées, les textes et nombres de la maquette absents du scénario.

Les planches HTML lues par les tests sont celles de `docs/maquettes-v3/*.dc.html` (`src/testing/planches.ts`).
