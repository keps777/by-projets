import type { agence } from "@afrimove/contrats";

/** Heure limite de présentation avant le départ : la planche compte les non-présentés à 08:25 pour un départ à 08:30. */
export const MINUTES_AVANT_DEPART_LIMITE = 5;

/** « 2027-01-05T08:19:42.000+01:00 » -> « 08:19 » (les heures du contrat sont déjà à l'heure de Douala). */
export function heureDouala(iso: string): string {
  return iso.slice(11, 16);
}

/** « 2027-01-05T08:19:42.000+01:00 » -> « 08:19:42 ». */
export function heureSecondes(iso: string): string {
  return iso.slice(11, 19);
}

/** Heure limite d'un départ : « 08:30 » -> « 08:25 ». */
export function heureLimite(heureDepart: string): string {
  const [h = 0, m = 0] = heureDouala(heureDepart).split(":").map(Number);
  const total = Math.max(0, h * 60 + m - MINUTES_AVANT_DEPART_LIMITE);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Part des places embarquées, entière et bornée à 0-100 (31 sur 40 -> 78). */
export function pourcentage(embarques: number, capacite: number): number {
  if (capacite <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((embarques / capacite) * 100)));
}

/**
 * Heure du premier scan d'un billet déjà scanné : celle que cet écran a vu monter, sinon celle du dernier scan
 * connu du quai, sinon celle que porte le compteur de refusés.
 */
export function premierScanDe(
  scan: agence.ScanQuai,
  quai: agence.QuaiEmbarquement,
  vusIci: ReadonlyMap<string, string>,
): string | null {
  const ici = vusIci.get(scan.billetId);
  if (ici) return ici;
  if (quai.dernierScan?.resultat === "monte" && quai.dernierScan.billetId === scan.billetId) {
    return quai.dernierScan.at;
  }
  return quai.refuses.premierScanA;
}
