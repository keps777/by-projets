import type { Bitmap } from "../escpos/bitmap";
import {
  CELLULE,
  ConstructeurEscPos,
  PAPIER_58_MM,
  colonnes,
  type Alignement,
  type Morceau,
  type ProfilPapier,
} from "../escpos/constructeur";
import { longueurImprimee } from "../escpos/codepage";

/** Une ligne de texte de la mise en page (un ou plusieurs morceaux de tailles différentes). */
export interface ElementTexte {
  type: "texte";
  morceaux: Morceau[];
  alignement: Alignement;
  ecart: number;
}

export interface ElementImage {
  type: "image";
  image: Bitmap;
  alignement: Alignement;
  ecart: number;
}

/** Papier blanc. */
export interface ElementEspace {
  type: "espace";
  points: number;
}

export type ElementGabarit = ElementTexte | ElementImage | ElementEspace;

export interface OptionsRendu {
  papier?: ProfilPapier;
  /** Hauteur totale exacte du document, en points (étiquette 40 mm : 320). */
  hauteurFixe?: number;
  /** Papier avancé après le dernier élément, pour que le ticket dépasse de la tête d'impression. */
  avanceFinale?: number;
}

/** Texte brut d'un élément : ce que l'agent lit sur le papier (sans l'image). */
export function texteDe(element: ElementGabarit): string {
  return element.type === "texte" ? element.morceaux.map((m) => m.texte).join("") : "";
}

function peindre(sortie: ConstructeurEscPos, elements: ElementGabarit[]): void {
  for (const element of elements) {
    if (element.type === "texte") {
      sortie.ligne(element.morceaux, { alignement: element.alignement, ecart: element.ecart });
    } else if (element.type === "image") {
      sortie.image(element.image, element.alignement, element.ecart);
    } else {
      sortie.avancer(element.points);
    }
  }
}

/** Rend la mise en page en octets ESC/POS. */
export function rendreEscPos(elements: ElementGabarit[], options: OptionsRendu = {}): Uint8Array {
  const { papier = PAPIER_58_MM, hauteurFixe, avanceFinale = 0 } = options;
  const sortie = new ConstructeurEscPos(papier).initialiser();
  peindre(sortie, elements);
  if (hauteurFixe !== undefined) sortie.completerJusqua(hauteurFixe);
  else if (avanceFinale > 0) sortie.avancer(avanceFinale);
  return sortie.construire();
}

/** Hauteur de papier consommée par la mise en page, en points. */
export function hauteurDe(elements: ElementGabarit[], papier: ProfilPapier = PAPIER_58_MM): number {
  const sortie = new ConstructeurEscPos(papier);
  peindre(sortie, elements);
  return sortie.hauteur();
}

/**
 * Coupe un texte en lignes d'au plus `largeur` caractères. On coupe de préférence sur « · » (les mentions
 * de pied de ticket en contiennent), sinon sur une espace, sinon au milieu d'un mot trop long.
 */
export function decouperTexte(texte: string, largeur: number): string[] {
  if (longueurImprimee(texte) <= largeur) return [texte];
  const lignes: string[] = [];
  let courante = "";
  const separateur = texte.includes(" · ") ? " · " : " ";
  const unites = texte.split(separateur);
  for (const unite of unites) {
    const essai = courante === "" ? unite : `${courante}${separateur}${unite}`;
    if (longueurImprimee(essai) <= largeur) {
      courante = essai;
      continue;
    }
    if (courante !== "") lignes.push(courante);
    courante = unite;
    while (longueurImprimee(courante) > largeur) {
      lignes.push(courante.slice(0, largeur));
      courante = courante.slice(largeur);
    }
  }
  if (courante !== "") lignes.push(courante);
  return lignes;
}

/** Plus grand multiplicateur de largeur (jusqu'à `max`) pour lequel le texte tient sur une ligne. */
export function largeurQuiTient(
  texte: string,
  papier: ProfilPapier,
  max: number,
  police: "A" | "B" = "A",
): number {
  let l = max;
  while (l > 1 && longueurImprimee(texte) > colonnes(papier, police, l)) l -= 1;
  return l;
}

/** Ligne courante de la mise en page. */
export function ligneTexte(
  morceaux: Morceau[] | string,
  alignement: Alignement = "gauche",
  ecart = 2,
): ElementTexte {
  return {
    type: "texte",
    morceaux: typeof morceaux === "string" ? [{ texte: morceaux }] : morceaux,
    alignement,
    ecart,
  };
}

export { CELLULE };
