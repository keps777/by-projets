/** Typographie du système v3 : trois familles, échelle relevée dans les maquettes. */

export const famillesPolices = {
  /** Titres, montants, volets de destination. */
  titre: '"Bricolage Grotesque", "Arial Black", sans-serif',
  /** Texte courant. */
  texte: '"Instrument Sans", Arial, system-ui, sans-serif',
  /** Chiffres, heures, codes, étiquettes. */
  mono: '"Geist Mono", "Courier New", monospace',
} as const;

export type FamillePoliceNom = keyof typeof famillesPolices;

export const poidsPolices = {
  titre: [500, 700, 800],
  texte: [400, 500, 600, 700],
  mono: [500, 700],
} as const satisfies Record<FamillePoliceNom, readonly number[]>;

/** Tailles en px relevées dans les planches (10 à 56). Les tailles de 9 px et moins ne sont pas reprises. */
export const tailles = [
  10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 34, 36, 40, 44, 48, 56,
] as const;

export type Taille = (typeof tailles)[number];

/** Tailles minimales du ticket AM-003 : 14 px texte courant, 18 px montant, 28 px code de retrait. */
export const taillesMinimales = {
  texteCourant: 14,
  montant: 18,
  codeRetrait: 28,
} as const;

/** Interlettrage : étiquettes mono en majuscules .12 à .14em, titres légèrement resserrés. */
export const interlettrage = {
  etiquette: ".14em",
  etiquetteSerree: ".12em",
  code: ".1em",
  sousTitre: "-.01em",
  titre: "-.02em",
  titreSerre: "-.03em",
} as const;

export const hauteursLigne = {
  affiche: 0.95,
  plein: 1,
  titre: 1.05,
  compacte: 1.1,
  serree: 1.15,
  normale: 1.3,
  texte: 1.4,
  aere: 1.45,
  large: 1.5,
} as const;

export interface StyleTexte {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing?: string;
  lineHeight: number;
  textTransform?: "uppercase";
}

/** Styles composés, chacun relevé dans Systeme.dc.html (la couleur reste au choix de l'écran). */
export const stylesTexte = {
  /** « Où vas-tu aujourd'hui ? » */
  affiche: {
    fontFamily: famillesPolices.titre,
    fontSize: 56,
    fontWeight: 800,
    letterSpacing: interlettrage.titreSerre,
    lineHeight: hauteursLigne.affiche,
  },
  /** Titre de planche. */
  titre: {
    fontFamily: famillesPolices.titre,
    fontSize: 36,
    fontWeight: 800,
    letterSpacing: interlettrage.titre,
    lineHeight: hauteursLigne.titre,
  },
  /** Texte courant, 14 px minimum. */
  texteCourant: {
    fontFamily: famillesPolices.texte,
    fontSize: 14,
    fontWeight: 400,
    lineHeight: hauteursLigne.texte,
  },
  /** Mention secondaire. */
  note: {
    fontFamily: famillesPolices.texte,
    fontSize: 13,
    fontWeight: 400,
    lineHeight: hauteursLigne.aere,
  },
  /** Étiquette mono en majuscules. */
  etiquette: {
    fontFamily: famillesPolices.mono,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: interlettrage.etiquette,
    lineHeight: hauteursLigne.plein,
    textTransform: "uppercase",
  },
  /** Montant, 18 px minimum. */
  montant: {
    fontFamily: famillesPolices.titre,
    fontSize: 18,
    fontWeight: 800,
    lineHeight: hauteursLigne.plein,
  },
  /** Heure ou chiffre de liste. */
  heure: {
    fontFamily: famillesPolices.mono,
    fontSize: 18,
    fontWeight: 700,
    lineHeight: hauteursLigne.plein,
  },
  /** Chiffre d'une case du code de retrait, 28 px minimum. */
  codeRetrait: {
    fontFamily: famillesPolices.mono,
    fontSize: 28,
    fontWeight: 700,
    lineHeight: hauteursLigne.plein,
  },
  /** Code du billet à 4 chiffres. */
  codeBillet: {
    fontFamily: famillesPolices.mono,
    fontSize: 48,
    fontWeight: 700,
    letterSpacing: interlettrage.code,
    lineHeight: hauteursLigne.plein,
  },
} as const satisfies Record<string, StyleTexte>;

export type StyleTexteNom = keyof typeof stylesTexte;

/** Fichier woff2 local (police variable : un fichier par famille et par sous-ensemble Unicode). */
export interface PoliceLocale {
  famille: string;
  /** Intervalle de graisses couvert par le fichier variable. */
  graisses: string;
  fichier: string;
  sousEnsemble: "latin" | "latin-ext";
  unicodeRange: string;
}

const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF";

function police(famille: string, prefixe: string, graisses: string): PoliceLocale[] {
  return [
    {
      famille,
      graisses,
      fichier: `${prefixe}-latin.woff2`,
      sousEnsemble: "latin",
      unicodeRange: LATIN,
    },
    {
      famille,
      graisses,
      fichier: `${prefixe}-latin-ext.woff2`,
      sousEnsemble: "latin-ext",
      unicodeRange: LATIN_EXT,
    },
  ];
}

export const policesLocales: readonly PoliceLocale[] = [
  ...police("Bricolage Grotesque", "bricolage-grotesque", "500 800"),
  ...police("Instrument Sans", "instrument-sans", "400 700"),
  ...police("Geist Mono", "geist-mono", "500 700"),
];

/** Polices à précharger (<link rel="preload">) : le sous-ensemble latin, qui couvre le français. */
export const prechargementPolices = policesLocales
  .filter((p) => p.sousEnsemble === "latin")
  .map((p) => ({
    href: `fonts/${p.fichier}`,
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  }));
