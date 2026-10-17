import type { patron } from "@afrimove/contrats";

/** Le fichier tel que l'API le remet : les octets, le nom et le type d'origine. */
type Fichier = Pick<patron.FichierExport, "nom" | "typeMime" | "octets">;

/**
 * « Télécharger » : remet à l'appareil le vrai fichier de l'export, octet pour octet (XLSX, CSV ou PDF, avec l'empreinte
 * AfriMove qu'il porte), sous le nom que l'API lui donne. Un lien temporaire est cliqué par programme, puis retiré.
 */
export function remettreLeFichier(fichier: Fichier): void {
  // Une copie : le Blob garde ses propres octets, le tampon d'origine reste à l'appelant.
  const blob = new Blob([new Uint8Array(fichier.octets)], { type: fichier.typeMime });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = fichier.nom;
  lien.rel = "noopener";
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
