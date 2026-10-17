/** Formats de l'écran « Vérification de la fiche » : barre d'étapes, état des jalons, jour de la visite, récit. */

import type { colis as contrats } from "@afrimove/contrats";

export type SegmentEtape = "fait" | "courant" | "refuse" | "reste";

/**
 * Les segments de la barre de l'en-tête : ceux d'avant l'étape courante sont verts, l'étape courante est ambre
 * (verte une fois la demande active, rouge si elle est refusée), les suivants sont gris. Sans étape, pas de barre.
 */
export function segmentsEtapes(
  etape: contrats.SuiviDemande["etape"],
  statut: contrats.SuiviDemande["statut"],
): SegmentEtape[] {
  if (etape === null) return [];
  return Array.from({ length: etape.total }, (_, i): SegmentEtape => {
    const rang = i + 1;
    if (rang < etape.courante) return "fait";
    if (rang > etape.courante) return "reste";
    return statut === "active" ? "fait" : statut === "refusee" ? "refuse" : "courant";
  });
}

export type EtatJalon = "fait" | "en-cours" | "a-venir";

/**
 * L'état de chaque jalon : fait, puis le premier qui ne l'est pas est « en cours » (il pulse) et les suivants
 * « à venir ». Une demande refusée ou active n'a plus de jalon en cours.
 */
export function etatsJalons(
  jalons: readonly Pick<contrats.JalonDemande, "fait">[],
  statut: contrats.SuiviDemande["statut"],
): EtatJalon[] {
  const premier = jalons.findIndex((j) => !j.fait);
  return jalons.map((j, i): EtatJalon => {
    if (j.fait) return "fait";
    return i === premier && statut === "en_cours" ? "en-cours" : "a-venir";
  });
}

const JOURS =
  /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|aujourd['’]hui)(?=\s|$)/i;

/** « jeudi entre 9 h et 12 h » -> « jeudi » : le jour où l'on prévient par SMS ; `null` si le créneau n'en donne pas. */
export function jourDeVisite(creneau: string): string | null {
  return JOURS.exec(creneau.trim())?.[0].toLowerCase() ?? null;
}

/**
 * Le récit de la suite : la dernière phrase (ce que les voyageurs voient dès le soir) est en gras dans la maquette.
 * Un récit d'une seule phrase reste tel quel, sans gras.
 */
export function separerRecit(texte: string): { debut: string; fin: string } {
  const coupe = texte.lastIndexOf(". ");
  if (coupe < 0) return { debut: texte, fin: "" };
  return { debut: texte.slice(0, coupe + 2), fin: texte.slice(coupe + 2) };
}
