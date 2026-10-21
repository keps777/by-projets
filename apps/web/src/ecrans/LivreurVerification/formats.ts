/** Formats de la planche « LivreurVerification » (docs/maquettes-v3/LivreurVerification.dc.html). */

export type EtatJalon = "fait" | "en_cours" | "a_venir";

/**
 * État de chaque jalon de la frise : coche verte pour ce qui est fait, rond bleu qui pulse pour le premier jalon à faire
 * (la vérification en cours), rond vide pour la suite.
 */
export function etatsDesJalons(jalons: readonly { fait: boolean }[]): EtatJalon[] {
  const courant = jalons.findIndex((j) => !j.fait);
  return jalons.map((j, i) => (j.fait ? "fait" : i === courant ? "en_cours" : "a_venir"));
}

/**
 * Sépare le récit de la première soirée de sa dernière phrase, que la planche met en gras (« 700 F sur ton MoMo le soir
 * même. »). Sans point suivi d'une espace, tout le texte est le début.
 */
export function decouperRecit(texte: string): { debut: string; fin: string } {
  const coupe = texte.lastIndexOf(". ");
  if (coupe === -1) return { debut: texte, fin: "" };
  return { debut: texte.slice(0, coupe + 2), fin: texte.slice(coupe + 2) };
}

/** Coupe « Modifier ma fiche » après son premier mot : la planche le met sur deux lignes. */
export function decouperEnDeuxLignes(texte: string): { haut: string; bas: string } {
  const i = texte.indexOf(" ");
  if (i === -1) return { haut: texte, bas: "" };
  return { haut: texte.slice(0, i), bas: texte.slice(i + 1) };
}
