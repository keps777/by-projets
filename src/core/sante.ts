// Santé : tiers payant, plafond annuel, étalement de la part du patient.
import { mensualite } from './credit.ts';
import type { Pass } from './credit.ts';

export interface Couverture { taux: number; pharmacie: number; plafond: number; personnes: number; teleconsultations: number }
export const COUVERTURES: Record<Pass, Couverture> = {
  essentiel: { taux: 0.8, pharmacie: 0.7, plafond: 400_000, personnes: 1, teleconsultations: 2 },
  famille: { taux: 0.8, pharmacie: 0.7, plafond: 1_200_000, personnes: 6, teleconsultations: Infinity },
  premium: { taux: 0.9, pharmacie: 0.8, plafond: 2_500_000, personnes: 6, teleconsultations: Infinity }
};
export const PRIX_PASS: Record<Pass, number> = { essentiel: 9000, famille: 25000, premium: 60000 };
export interface LigneFacture { nom: string; sous: string; montant: number; note: string }
export interface ResultatLigne { montant: number; assureMe: number; patient: number }
export interface Repartition { lignes: ResultatLigne[]; total: number; assureMe: number; patient: number; plafondDepasse: boolean }

/** Répartit une facture : AssureMe paie `taux` de chaque ligne, dans la limite du plafond restant ; le patient paie le reste. */
export function repartirFacture(lignes: { montant: number }[], taux: number, plafondRestant: number): Repartition {
  let restant = Math.max(0, plafondRestant);
  let depasse = false;
  const res = lignes.map((l) => {
    const voulu = Math.round(l.montant * taux);
    const am = Math.min(voulu, restant);
    if (am < voulu) depasse = true;
    restant -= am;
    return { montant: l.montant, assureMe: am, patient: l.montant - am };
  });
  const total = res.reduce((s, l) => s + l.montant, 0), assureMe = res.reduce((s, l) => s + l.assureMe, 0);
  return { lignes: res, total, assureMe, patient: total - assureMe, plafondDepasse: depasse };
}
/** Étaler la part du patient sur `mois` mois à `taux` par mois. */
export const etalerPart = (part: number, mois = 3, tauxMensuel = 0.015) => Math.round(mensualite(part, tauxMensuel, mois));
export const pctPlafond = (utilise: number, plafond: number) => Math.min(100, Math.round((utilise / plafond) * 100));

/** Distance en km entre deux points GPS (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (x: number) => (x * Math.PI) / 180, R = 6371;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Code de carte qui change toutes les 30 s (à présenter à la caisse) : dérivé du numéro et du créneau, vérifiable côté partenaire. */
export function codeCarte(numeroMembre: string, now: number): string {
  const creneau = Math.floor(now / 30_000);
  let h = 2166136261;
  for (const ch of `${numeroMembre}:${creneau}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return String(h % 1_000_000).padStart(6, '0');
}
export const secondesRestantesCode = (now: number) => 30 - Math.floor((now % 30_000) / 1000);
