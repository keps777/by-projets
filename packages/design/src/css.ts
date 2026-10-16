import { complements, couleurs, teintesEtat } from "./couleurs";
import type { ComplementNom, CouleurNom, TeinteEtatNom } from "./couleurs";
import { espaces, gouttiere, pulse, rayonPilule, rayons, rayonsComplementaires } from "./formes";
import {
  famillesPolices,
  hauteursLigne,
  interlettrage,
  policesLocales,
  tailles,
} from "./typographie";

export type VariableCss = `--am-${string}`;

/** « surface2 » → « surface-2 », « vertFond » → « vert-fond ». */
function kebab(nom: string): string {
  return nom.replace(/([a-z])(\d)/g, "$1-$2").replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

function groupe(
  prefixe: string,
  valeurs: Record<string, string | number>,
): [VariableCss, string][] {
  return Object.entries(valeurs).map(([nom, valeur]) => [
    `--am-${prefixe}${kebab(nom)}`,
    String(valeur),
  ]);
}

/** Toutes les variables `--am-*`, dans l'ordre où elles sont écrites dans css/tokens.css. */
export function variablesCss(): Record<VariableCss, string> {
  const entrees: [VariableCss, string][] = [
    ...groupe("", couleurs),
    ...groupe("", teintesEtat),
    ...groupe("", complements),
    ...groupe("font-", famillesPolices),
    ...tailles.map((t): [VariableCss, string] => [`--am-fs-${t}`, `${t}px`]),
    ...groupe("ls-", interlettrage),
    ...groupe("lh-", hauteursLigne),
    ...[...rayonsComplementaires, ...rayons]
      .sort((a, b) => a - b)
      .map((r): [VariableCss, string] => [`--am-radius-${r}`, `${r}px`]),
    ["--am-radius-pill", `${rayonPilule}px`],
    ...espaces.map((e): [VariableCss, string] => [`--am-space-${e}`, `${e}px`]),
    ["--am-gutter", `${gouttiere}px`],
    ["--am-pulse-duration", pulse.duree],
    ["--am-pulse-min", String(pulse.opaciteMin)],
  ];
  return Object.fromEntries(entrees) as Record<VariableCss, string>;
}

/** `var(--am-ambre)` pour une couleur, une teinte d'état ou un complément. */
export function couleurVar(nom: CouleurNom | TeinteEtatNom | ComplementNom): string {
  return `var(--am-${kebab(nom)})`;
}

/** Écriture que Prettier donne au CSS : couleurs en minuscules, zéro initial (« .14em » → « 0.14em »). */
function formaterValeur(valeur: string): string {
  return valeur.startsWith("#") ? valeur.toLowerCase() : valeur.replace(/^(-?)\./, "$10.");
}

/** Contenu de css/tokens.css : variables, animation « pulse » et sa classe utilitaire. */
export function cssTokens(): string {
  const lignes = Object.entries(variablesCss()).map(
    ([nom, valeur]) => `  ${nom}: ${formaterValeur(valeur)};`,
  );
  return [
    ":root {",
    ...lignes,
    "}",
    "",
    "@keyframes pulse {",
    "  0%,",
    "  100% {",
    "    opacity: 1;",
    "  }",
    "",
    "  50% {",
    `    opacity: ${pulse.opaciteMin};`,
    "  }",
    "}",
    "",
    ".am-pulse {",
    `  animation: ${pulse.animation};`,
    "}",
    "",
  ].join("\n");
}

/** Contenu de css/fonts.css : un @font-face par fichier woff2 de fonts/. */
export function cssPolices(): string {
  return policesLocales
    .map((p) =>
      [
        "@font-face {",
        `  font-family: "${p.famille}";`,
        "  font-style: normal;",
        `  font-weight: ${p.graisses};`,
        "  font-display: swap;",
        `  src: url("../fonts/${p.fichier}") format("woff2");`,
        `  unicode-range: ${p.unicodeRange};`,
        "}",
        "",
      ].join("\n"),
    )
    .join("\n");
}
