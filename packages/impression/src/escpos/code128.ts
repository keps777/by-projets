import { bitmapDepuis, type Bitmap } from "./bitmap";

/**
 * Code 128 (jeux B et C) : largeurs barre/espace de chacun des 107 symboles, en modules. Les 106
 * premiers font 11 modules, l'arrêt 13. Le code est dessiné en image plutôt que confié à l'imprimante
 * (GS k) : la largeur des modules est ainsi connue et identique sur tous les modèles.
 */
export const MOTIFS_CODE128: readonly string[] = `
  212222 222122 222221 121223 121322 131222 122213 122312 132212
  221213 221312 231212 112232 122132 122231 113222 123122 123221
  223211 221132 221231 213212 223112 312131 311222 321122 321221
  312212 322112 322211 212123 212321 232121 111323 131123 131321
  112313 132113 132311 211313 231113 231311 112133 112331 132131
  113123 113321 133121 313121 211331 231131 213113 213311 213131
  311123 311321 331121 312113 312311 332111 314111 221411 431111
  111224 111422 121124 121421 141122 141221 112214 112412 122114
  122411 142112 142211 241211 221114 413111 241112 134111 111242
  121142 121241 114212 124112 124211 411212 421112 421211 212141
  214121 412121 111143 111341 131141 114113 114311 411113 411311
  113141 114131 311141 411131 211412 211214 211232 2331112
`
  .trim()
  .split(/\s+/);

const DEMARRAGE_B = 104;
const DEMARRAGE_C = 105;
const BASCULE_VERS_B = 100;
const BASCULE_VERS_C = 99;
const ARRET = 106;

interface Segment {
  jeu: "B" | "C";
  texte: string;
}

/** Longueur de la suite de chiffres qui commence à `debut`. */
function suiteDeChiffres(texte: string, debut: number): number {
  let fin = debut;
  while (fin < texte.length && texte.charAt(fin) >= "0" && texte.charAt(fin) <= "9") fin += 1;
  return fin - debut;
}

/**
 * Découpe en jeux B (texte) et C (chiffres par paires). Une suite de chiffres passe en jeu C à partir de
 * 4 chiffres en début ou en fin de texte, 6 au milieu (en dessous, le changement de jeu coûte plus cher
 * qu'il ne rapporte). Une suite impaire garde son premier chiffre en jeu B.
 */
function decouper(texte: string): Segment[] {
  const segments: Segment[] = [];
  const ajouter = (jeu: "B" | "C", morceau: string) => {
    const dernier = segments[segments.length - 1];
    if (dernier && dernier.jeu === jeu) dernier.texte += morceau;
    else segments.push({ jeu, texte: morceau });
  };
  let i = 0;
  while (i < texte.length) {
    const suite = suiteDeChiffres(texte, i);
    const seuil = i === 0 || i + suite === texte.length ? 4 : 6;
    if (suite >= seuil) {
      if (suite % 2 === 1) {
        ajouter("B", texte.charAt(i));
        i += 1;
      }
      const pairs = suite - (suite % 2);
      ajouter("C", texte.slice(i, i + pairs));
      i += pairs;
    } else {
      const n = Math.max(suite, 1);
      ajouter("B", texte.slice(i, i + n));
      i += n;
    }
  }
  return segments;
}

/** Valeurs des symboles : démarrage, données, caractère de contrôle, arrêt. */
export function symbolesCode128(texte: string): number[] {
  if (texte.length === 0) throw new Error("Code 128 : texte vide");
  for (const c of texte) {
    const code = c.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`Code 128 : caractère non imprimable « ${c} »`);
  }
  const symboles: number[] = [];
  decouper(texte).forEach((segment, rang) => {
    if (rang === 0) symboles.push(segment.jeu === "C" ? DEMARRAGE_C : DEMARRAGE_B);
    else symboles.push(segment.jeu === "C" ? BASCULE_VERS_C : BASCULE_VERS_B);
    if (segment.jeu === "C") {
      for (let i = 0; i < segment.texte.length; i += 2) {
        symboles.push(Number(segment.texte.slice(i, i + 2)));
      }
    } else {
      for (const c of segment.texte) symboles.push(c.charCodeAt(0) - 32);
    }
  });
  let somme = symboles[0] ?? 0;
  symboles.slice(1).forEach((valeur, rang) => {
    somme += valeur * (rang + 1);
  });
  symboles.push(somme % 103, ARRET);
  return symboles;
}

/** Modules du code (true = barre), zone de silence non comprise. */
export function modulesCode128(texte: string): boolean[] {
  const modules: boolean[] = [];
  for (const valeur of symbolesCode128(texte)) {
    const motif = MOTIFS_CODE128[valeur] ?? "";
    let barre = true;
    for (const largeur of motif) {
      for (let k = 0; k < Number(largeur); k += 1) modules.push(barre);
      barre = !barre;
    }
  }
  return modules;
}

export interface OptionsCodeBarres {
  /** Largeur d'un module en points d'impression. */
  module: number;
  hauteur: number;
  /** Zone de silence de chaque côté, en modules. */
  silence?: number;
}

/** Plus grande largeur de module (1 à `max`) pour laquelle le code tient dans `largeurMax` points. */
export function moduleQuiTient(texte: string, largeurMax: number, silence = 4, max = 3): number {
  const total = modulesCode128(texte).length + 2 * silence;
  let module = max;
  while (module > 1 && total * module > largeurMax) module -= 1;
  return module;
}

/** Code-barres en image monochrome. */
export function bitmapCodeBarres(texte: string, options: OptionsCodeBarres): Bitmap {
  const { module, hauteur, silence = 4 } = options;
  const modules = modulesCode128(texte);
  const largeur = (modules.length + 2 * silence) * module;
  return bitmapDepuis(largeur, hauteur, (x) => modules[Math.floor(x / module) - silence] === true);
}
