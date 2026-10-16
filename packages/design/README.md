# @afrimove/design

Design tokens du système graphique v3 (ticket AM-003). Toutes les valeurs sont relevées dans `docs/maquettes-v3/` ; la planche de référence est `Systeme.dc.html`. Rien n'est inventé : les tests relisent les planches et échouent si une valeur n'y figure pas.

Le package exporte deux formes du même contenu :

- des variables CSS `--am-*` (fichiers `css/tokens.css` et `css/fonts.css`) ;
- des objets TypeScript typés (`src/`).

## Contenu

| Fichier              | Rôle                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/couleurs.ts`    | `couleurs` (les 12 de la planche Système plus le Gris), `teintesEtat` (fonds et bords vert, rouge, ambre, bleu), `complements` (trois valeurs récurrentes hors liste) |
| `src/typographie.ts` | familles et replis, graisses, échelle de tailles, interlettrage, hauteurs de ligne, `stylesTexte`, `taillesMinimales`, liste des fichiers woff2                       |
| `src/formes.ts`      | rayons, écarts, gouttière, animation `pulse`                                                                                                                          |
| `src/css.ts`         | `variablesCss()`, `cssTokens()`, `cssPolices()`, `couleurVar()`                                                                                                       |
| `css/tokens.css`     | `:root { --am-* }`, `@keyframes pulse`, classe `.am-pulse`                                                                                                            |
| `css/fonts.css`      | les `@font-face`, qui pointent vers `fonts/*.woff2`                                                                                                                   |
| `fonts/`             | les six fichiers woff2 (voir `fonts/README.md`)                                                                                                                       |

## Utilisation dans l'application web

```ts
// main.tsx
import "@afrimove/design/fonts.css";
import "@afrimove/design/tokens.css";
```

```css
.carte {
  background: var(--am-surface);
  border: 1px solid var(--am-trait);
  border-radius: var(--am-radius-16);
  padding: var(--am-space-12) var(--am-space-14);
  color: var(--am-craie);
  font-family: var(--am-font-texte);
  font-size: var(--am-fs-14);
}

.pastille-direct::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: var(--am-radius-pill);
  background: var(--am-vert);
}
```

Un point « en direct » ajoute la classe `am-pulse` (opacité 1 → .35 → 1 en 1,6 s, en boucle).

Côté TypeScript :

```ts
import { couleurs, couleurVar, stylesTexte, taillesMinimales } from "@afrimove/design";

couleurs.ambre; // "#FFB547"
couleurVar("surface2"); // "var(--am-surface-2)"
stylesTexte.codeRetrait; // { fontFamily, fontSize: 28, fontWeight: 700, lineHeight: 1 }
```

`stylesTexte.*` est compatible avec l'attribut `style` de React (`fontFamily`, `fontSize`, `fontWeight`, `letterSpacing`, `lineHeight`, `textTransform`) ; la couleur reste au choix de l'écran.

### Noms des variables

| Famille           | Variables                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Couleurs          | `--am-nuit`, `--am-surface`, `--am-surface-2`, `--am-trait`, `--am-craie`, `--am-craie-2`, `--am-gris`, `--am-orange`, `--am-ambre`, `--am-vert`, `--am-rouge`, `--am-bleu`, `--am-profond` |
| États             | `--am-vert-fond`, `--am-vert-bord`, `--am-rouge-fond`, `--am-ambre-fond`, `--am-bleu-fond`                                                                                                  |
| Compléments       | `--am-carte-sombre`, `--am-trait-fort`, `--am-gris-sourd`                                                                                                                                   |
| Familles          | `--am-font-titre`, `--am-font-texte`, `--am-font-mono`                                                                                                                                      |
| Tailles           | `--am-fs-10` à `--am-fs-56` (voir `tailles`)                                                                                                                                                |
| Interlettrage     | `--am-ls-etiquette` (.14em), `--am-ls-etiquette-serree` (.12em), `--am-ls-code`, `--am-ls-sous-titre`, `--am-ls-titre`, `--am-ls-titre-serre`                                               |
| Hauteurs de ligne | `--am-lh-affiche`, `--am-lh-plein`, `--am-lh-titre`, `--am-lh-compacte`, `--am-lh-serree`, `--am-lh-normale`, `--am-lh-texte`, `--am-lh-aere`, `--am-lh-large`                              |
| Rayons            | `--am-radius-6`, `-8`, `-10`, `-12`, `-14`, `-16`, `-18`, `-20`, `-22`, `--am-radius-pill` (999 px)                                                                                         |
| Écarts            | `--am-space-2` à `--am-space-24`, `--am-gutter` (16 px)                                                                                                                                     |
| Animation         | `--am-pulse-duration`, `--am-pulse-min`                                                                                                                                                     |

Les rayons 12, 14, 16, 18, 22 et 999 sont ceux du ticket ; 6, 8, 10 et 20 sont des rayons très présents dans les planches, ajoutés à part (`rayonsComplementaires`).

### Tailles minimales

14 px pour le texte courant, 18 px pour un montant, 28 px pour le code de retrait : `taillesMinimales`, et les styles `texteCourant`, `montant`, `codeRetrait` de `stylesTexte` les respectent (un test le vérifie). Les mentions secondaires de 10 à 13 px existent dans les planches (`note`, `etiquette`) et sont réservées aux libellés qui ne portent pas l'information principale.

## Polices

Trois familles en woff2 locaux, chargées par `@font-face` (`font-display: swap`), sans appel à Google Fonts à l'exécution :

| Rôle              | Famille             | Graisses      | Repli                        |
| ----------------- | ------------------- | ------------- | ---------------------------- |
| Titres            | Bricolage Grotesque | 500, 700, 800 | Arial Black, sans-serif      |
| Texte             | Instrument Sans     | 400 à 700     | Arial, system-ui, sans-serif |
| Chiffres et codes | Geist Mono          | 500, 700      | Courier New, monospace       |

Chaque fichier est une police variable qui couvre toutes les graisses de sa famille. Le sous-ensemble `latin` couvre le français ; `latin-ext` est chargé seulement si un caractère l'exige (`unicode-range`). Procédure de mise à jour et licence : `fonts/README.md`.

### Préchargement et cache hors ligne

`prechargementPolices` liste les trois fichiers `latin` à précharger. Avec Vite, importer l'URL finale (hachée) et déclarer le `<link>` :

```ts
import bricolage from "@afrimove/design/fonts/bricolage-grotesque-latin.woff2?url";

const lien = document.createElement("link");
Object.assign(lien, {
  rel: "preload",
  as: "font",
  type: "font/woff2",
  crossOrigin: "anonymous",
  href: bricolage,
});
document.head.append(lien);
```

Pour le service worker (vite-plugin-pwa), inclure `woff2` dans le précache : `workbox: { globPatterns: ["**/*.{js,css,html,woff2}"] }`. Ces deux réglages appartiennent à `apps/web` (AM-010 et AM-017), pas à ce package.

## Tests

```
pnpm --filter @afrimove/design run test
pnpm --filter @afrimove/design run typecheck
pnpm --filter @afrimove/design run lint
```

- `src/palette.test.ts` lit `Systeme.dc.html`, en extrait les 12 pastilles (nom, aplat, code affiché) et compare avec `couleurs` ; il vérifie aussi que chaque couleur, teinte et complément figure dans au moins une des planches.
- `src/tokens.test.ts` vérifie que `css/tokens.css` et `css/fonts.css` correspondent aux objets TypeScript, que les six fichiers woff2 existent, que les graisses sont celles demandées par la planche, que chaque taille, rayon, écart et interlettrage figure dans les planches, que l'animation `pulse` est identique à celle de `Main.dc.html`, et que les tailles minimales sont respectées.

Modifier une valeur : changer l'objet TypeScript, puis recopier le résultat de `cssTokens()` (ou `cssPolices()`) dans `css/tokens.css` (ou `css/fonts.css`) et lancer `pnpm exec prettier --write css`. Le test de correspondance indique tout écart.
