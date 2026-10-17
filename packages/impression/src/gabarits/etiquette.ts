import { bitmapCodeBarres, moduleQuiTient } from "../escpos/code128";
import { PAPIER_58_MM, colonnes, type ProfilPapier } from "../escpos/constructeur";
import {
  decouperTexte,
  hauteurDe,
  largeurQuiTient,
  ligneTexte,
  rendreEscPos,
  type ElementGabarit,
} from "./mise-en-page";

/**
 * Ce que l'étiquette colis 58 × 40 mm porte. Le code de retrait n'en fait pas partie : il n'est envoyé
 * qu'au destinataire, par SMS. Ce type ne le contient pas, et `genererEtiquette` ne recopie que ces champs.
 * Planche de référence : GuichetColis (21).
 */
export interface DonneesEtiquette {
  /** « DLA → BAF ». */
  trajet: string;
  /** « Ngo Thérèse · ···· 18 22 » : nom et téléphone masqué. */
  destinataire: string;
  /** « C-ALP-DLA-270105-0042 » ; sert aussi de code-barres. */
  reference: string;
  /** « 2 kg ». */
  poids: string;
  /** Heure du départ, « 08:15 ». */
  heure: string;
  /** « Alpha Voyages · afrimove.cm · pas de code ici ». */
  mention: string;
}

export const MENTION_ETIQUETTE = "afrimove.cm · pas de code ici";

/** Étiquette 58 × 40 mm à 203 dpi. */
export const ETIQUETTE_LARGEUR_POINTS = 384;
export const ETIQUETTE_HAUTEUR_POINTS = 320;

export interface OptionsEtiquette {
  papier?: ProfilPapier;
  /** Hauteur de l'étiquette, en points ; le papier est complété jusque-là. */
  hauteurPoints?: number;
  /** Hauteur des barres, en points. */
  hauteurBarres?: number;
}

/** Ne garde que les champs de l'étiquette, quoi que l'appelant ait passé en plus (par exemple un code de retrait). */
export function champsEtiquette(d: DonneesEtiquette): DonneesEtiquette {
  return {
    trajet: String(d.trajet),
    destinataire: String(d.destinataire),
    reference: String(d.reference),
    poids: String(d.poids),
    heure: String(d.heure),
    mention: String(d.mention),
  };
}

/** Mise en page de l'étiquette : trajet en gros, destinataire, référence, code-barres, mention. */
export function mettreEnPageEtiquette(
  donnees: DonneesEtiquette,
  options: OptionsEtiquette = {},
): ElementGabarit[] {
  const d = champsEtiquette(donnees);
  const { papier = PAPIER_58_MM, hauteurBarres = 80 } = options;
  const elements: ElementGabarit[] = [];
  elements.push(
    ligneTexte(
      [{ texte: d.trajet, gras: true, l: largeurQuiTient(d.trajet, papier, 2), h: 2 }],
      "gauche",
      4,
    ),
  );
  elements.push(
    ...decouperTexte(d.destinataire, colonnes(papier)).map((t) =>
      ligneTexte([{ texte: t, gras: true }], "gauche", 2),
    ),
  );
  elements.push(
    ...decouperTexte(`${d.reference} · ${d.poids} · ${d.heure}`, colonnes(papier, "B")).map((t) =>
      ligneTexte([{ texte: t, police: "B" }], "gauche", 4),
    ),
  );
  elements.push({
    type: "image",
    image: bitmapCodeBarres(d.reference, {
      module: moduleQuiTient(d.reference, papier.largeurPoints),
      hauteur: hauteurBarres,
    }),
    alignement: "centre",
    ecart: 4,
  });
  elements.push(
    ...decouperTexte(d.mention, colonnes(papier, "B")).map((t) =>
      ligneTexte([{ texte: t, police: "B" }], "centre", 2),
    ),
  );
  return elements;
}

/** Octets ESC/POS de l'étiquette, complétés à la hauteur exacte de l'étiquette. */
export function genererEtiquette(d: DonneesEtiquette, options: OptionsEtiquette = {}): Uint8Array {
  const papier = options.papier ?? PAPIER_58_MM;
  const elements = mettreEnPageEtiquette(d, options);
  const hauteur = options.hauteurPoints ?? ETIQUETTE_HAUTEUR_POINTS;
  if (hauteurDe(elements, papier) > hauteur) {
    throw new Error("Étiquette : le contenu dépasse la hauteur de l'étiquette");
  }
  return rendreEscPos(elements, { papier, hauteurFixe: hauteur });
}
