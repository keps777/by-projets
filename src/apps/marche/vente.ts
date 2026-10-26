// Revendre : bornes du prix, rang parmi les annonces, ce que le vendeur reçoit. Fonctions pures.
import { commission, net, taux, TAUX_COMMISSION, TAUX_COMMISSION_PASS } from '../../core/regles.ts';
import { arrondi, fmtPct } from '../../core/argent.ts';

/** Bornes du prix de vente : du quart du prix neuf (par 10 $) au plafond, égal au prix équivalent neuf. */
export function bornesVente(prixNeuf: number): { min: number; max: number } { return { min: Math.max(10, Math.min(prixNeuf, Math.floor((prixNeuf * 0.25) / 10) * 10)), max: prixNeuf }; }
/** Cale un prix saisi : au pas de 10 $, jamais sous le minimum, jamais au-dessus du plafond ; texte invalide ou nul → `undefined`. */
export function caleVente(brut: number, prixNeuf: number): number | undefined {
  if (!Number.isFinite(brut) || brut <= 0) return undefined; const b = bornesVente(prixNeuf);
  return Math.min(b.max, Math.max(b.min, Math.round(brut / 10) * 10));
}
export interface Rang { rang: number; total: number; label: string }
/** Rang d'une annonce parmi les autres : « La moins chère des 4 », « 2e moins chère sur 4 ». À prix égal le vôtre passe devant (ancienneté). */
export function rangAnnonce(prix: number, autres: number[]): Rang {
  const total = autres.length + 1, moins = autres.filter((p) => p < prix).length;
  return { rang: moins + 1, total, label: total === 1 ? 'Seule annonce sur ce vol' : moins === 0 ? `La moins chère des ${total}` : `${moins + 1}e moins chère sur ${total}` };
}
export interface Recu { prix: number; taux: number; /** Taux du vendeur, « 10 % ». */ tauxLabel: string; /** Taux sans Pass, « 12,5 % ». */ tauxSansPass: string; commission: number; net: number; diff: number; sens: 'hausse' | 'baisse' | 'stable' }
const pctTaux = (t: number): string => fmtPct(t * 100).replace(/^\+/, '');
/** Ce que le vendeur reçoit si la vente a lieu : commission (hypothèse, taux Pass ou non), net, écart signé avec le prix payé. */
export function recu(prix: number, prixPaye: number, pass: boolean): Recu {
  const n = net(prix, pass), diff = arrondi(n - prixPaye);
  return { prix, taux: taux(pass), tauxLabel: pctTaux(taux(pass)), tauxSansPass: pctTaux(TAUX_COMMISSION), commission: commission(prix, pass), net: n, diff, sens: diff > 0 ? 'hausse' : diff < 0 ? 'baisse' : 'stable' };
}
export const tauxPass = pctTaux(TAUX_COMMISSION_PASS);
