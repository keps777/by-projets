/**
 * Formats d'affichage de la planche « SuperviseurVoir ». Les heures, les montants, les prénoms et le nom sans
 * titre sont ceux de « SuperviseurValider » (même rendu : « 13:51 », « 4 000 », « Marie », « Essono »).
 */
export { heureDouala, montant, nomSansTitre, prenom } from "@/ecrans/SuperviseurValider/formats";

/** Minutes écoulées depuis la demande ; jamais négatif (une horloge en retard sur la demande donne 0). */
export function minutesDepuis(demandeA: string, maintenant: Date): number {
  const ecoule = maintenant.getTime() - new Date(demandeA).getTime();
  return Number.isFinite(ecoule) ? Math.max(0, Math.floor(ecoule / 60_000)) : 0;
}

/** Numéro de billet sur quatre chiffres : `171` -> `0171`. */
export function sequenceBillet(sequence: number): string {
  return String(sequence).padStart(4, "0");
}

/** Suffixe de l'ordinal français : « 1re », « 2e ». */
export function suffixeOrdinal(rang: number): "re" | "e" {
  return rang === 1 ? "re" : "e";
}
