import type { patron } from "@afrimove/contrats";
import { nomDeFichier } from "./formats";

type Apercu = patron.ApercuExport;

/** Une cellule de CSV : entre guillemets dès qu'elle contient le séparateur, un guillemet ou un saut de ligne. */
function celluleCsv(valeur: string | number | null): string {
  if (valeur === null) return "";
  const texte = String(valeur);
  return /[;"\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

/**
 * Le tableau que l'aperçu montre, en CSV : mêmes colonnes dans le même ordre, mêmes lignes, valeurs de l'API telles
 * quelles (dates ISO, montants en entiers de FCFA, cellule vide sans texte). Séparateur « ; » pour le tableur français.
 */
export function csvDeLApercu(apercu: Apercu): string {
  const { colonnes, lignes } = apercu.tableau;
  return (
    [colonnes, ...lignes].map((ligne) => ligne.map(celluleCsv).join(";")).join("\r\n") + "\r\n"
  );
}

/** Nom du fichier téléchargé : celui de l'export, suffixé pour dire qu'il ne contient que les lignes de l'aperçu. */
export function nomDuFichierApercu(apercu: Apercu): string {
  return `${nomDeFichier(apercu.export.nom)}-apercu.csv`;
}

/** Remet un fichier à l'appareil : un lien temporaire cliqué par programme, puis retiré. */
export function remettreLeFichier(nom: string, contenu: string): void {
  // L'octet d'ordre (BOM) fait ouvrir les accents correctement dans le tableur.
  const fichier = new Blob(["\uFEFF", contenu], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(fichier);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  lien.rel = "noopener";
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** « Télécharger » : remet à l'appareil le tableau tel que l'aperçu le montre. */
export function telechargerApercu(apercu: Apercu): void {
  remettreLeFichier(nomDuFichierApercu(apercu), csvDeLApercu(apercu));
}
