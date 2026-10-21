import type { Bitmap } from "./bitmap";
import { PAGE_DE_CODE_PC850, encoderTexte } from "./codepage";

/** Caractéristiques du papier et de la tête d'impression. */
export interface ProfilPapier {
  /** Largeur imprimable en points (58 mm à 203 dpi : 384). */
  largeurPoints: number;
  /** Points par millimètre (203 dpi : 8). */
  pointsParMm: number;
}

export const PAPIER_58_MM: ProfilPapier = { largeurPoints: 384, pointsParMm: 8 };

export type Alignement = "gauche" | "centre" | "droite";
export type Police = "A" | "B";

/** Dimensions d'un caractère : police A 12 × 24 points, police B 9 × 17. */
export const CELLULE: Record<Police, { l: number; h: number }> = {
  A: { l: 12, h: 24 },
  B: { l: 9, h: 17 },
};

/** Morceau de texte d'une ligne : une même ligne peut mêler plusieurs tailles (« SIÈGE 19 · CLASSIQUE »). */
export interface Morceau {
  texte: string;
  gras?: boolean;
  /** Multiplicateur de largeur et de hauteur, de 1 à 8. */
  l?: number;
  h?: number;
  police?: Police;
}

export interface OptionsLigne {
  alignement?: Alignement;
  /** Points ajoutés sous la ligne. */
  ecart?: number;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
/** Taille maximale de la hauteur d'une bande GS v 0 : on découpe les grandes images en bandes. */
const HAUTEUR_BANDE = 128;

/**
 * Construit une suite d'ordres ESC/POS et suit la hauteur de papier consommée (en points), ce qui permet
 * de caler l'étiquette 58 × 40 mm sur sa hauteur exacte. Aucune dépendance au navigateur : le résultat est un
 * simple `Uint8Array`, comparable octet par octet dans les tests.
 */
export class ConstructeurEscPos {
  private readonly octets: number[] = [];
  private hauteurPoints = 0;

  constructor(readonly papier: ProfilPapier = PAPIER_58_MM) {}

  private pousser(...valeurs: number[]): this {
    this.octets.push(...valeurs);
    return this;
  }

  /** ESC @ puis page de code PC850 et interligne explicite. */
  initialiser(): this {
    return this.pousser(ESC, 0x40, ESC, 0x74, PAGE_DE_CODE_PC850);
  }

  private alignement(a: Alignement): this {
    return this.pousser(ESC, 0x61, a === "gauche" ? 0 : a === "centre" ? 1 : 2);
  }

  /** Une ligne de texte, éventuellement faite de plusieurs morceaux de tailles différentes. */
  ligne(contenu: string | Morceau[], options: OptionsLigne = {}): this {
    const morceaux: Morceau[] = typeof contenu === "string" ? [{ texte: contenu }] : contenu;
    const { alignement = "gauche", ecart = 0 } = options;
    const hauteurLigne = Math.max(
      ...morceaux.map((m) => CELLULE[m.police ?? "A"].h * Math.min(8, Math.max(1, m.h ?? 1))),
      CELLULE.A.h,
    );
    const interligne = hauteurLigne + ecart;
    this.alignement(alignement);
    this.pousser(ESC, 0x33, interligne);
    for (const morceau of morceaux) {
      const l = Math.min(8, Math.max(1, morceau.l ?? 1));
      const h = Math.min(8, Math.max(1, morceau.h ?? 1));
      this.pousser(ESC, 0x4d, (morceau.police ?? "A") === "A" ? 0 : 1);
      this.pousser(ESC, 0x45, morceau.gras ? 1 : 0);
      this.pousser(GS, 0x21, ((l - 1) << 4) | (h - 1));
      this.pousser(...encoderTexte(morceau.texte));
    }
    this.pousser(LF);
    // Retour aux valeurs par défaut pour que la ligne suivante ne dépende pas de celle-ci.
    this.pousser(ESC, 0x4d, 0, ESC, 0x45, 0, GS, 0x21, 0);
    this.hauteurPoints += interligne;
    return this;
  }

  /** Avance le papier de `points` points (ESC J, 255 au plus par ordre). */
  avancer(points: number): this {
    let reste = Math.max(0, Math.round(points));
    this.hauteurPoints += reste;
    while (reste > 0) {
      const pas = Math.min(255, reste);
      this.pousser(ESC, 0x4a, pas);
      reste -= pas;
    }
    return this;
  }

  /** Image monochrome (GS v 0), centrée ou alignée, découpée en bandes de 128 lignes. */
  image(image: Bitmap, alignement: Alignement = "centre", ecart = 0): this {
    this.alignement(alignement);
    const largeurOctets = image.octetsParLigne;
    for (let debut = 0; debut < image.hauteur; debut += HAUTEUR_BANDE) {
      const lignes = Math.min(HAUTEUR_BANDE, image.hauteur - debut);
      this.pousser(
        GS,
        0x76,
        0x30,
        0,
        largeurOctets & 0xff,
        largeurOctets >> 8,
        lignes & 0xff,
        lignes >> 8,
      );
      const tranche = image.donnees.subarray(
        debut * largeurOctets,
        (debut + lignes) * largeurOctets,
      );
      for (const octet of tranche) this.octets.push(octet);
    }
    this.hauteurPoints += image.hauteur;
    return ecart > 0 ? this.avancer(ecart) : this;
  }

  /** Hauteur de papier consommée jusqu'ici, en points. */
  hauteur(): number {
    return this.hauteurPoints;
  }

  /** Hauteur de papier consommée jusqu'ici, en millimètres. */
  hauteurMm(): number {
    return this.hauteurPoints / this.papier.pointsParMm;
  }

  /** Complète avec du papier blanc pour que la hauteur totale soit exactement `points`. */
  completerJusqua(points: number): this {
    return this.avancer(points - this.hauteurPoints);
  }

  construire(): Uint8Array {
    return Uint8Array.from(this.octets);
  }
}

/** Nombre de caractères d'une police sur la largeur du papier, au multiplicateur de largeur `l`. */
export function colonnes(papier: ProfilPapier, police: Police = "A", l = 1): number {
  return Math.floor(papier.largeurPoints / (CELLULE[police].l * l));
}
