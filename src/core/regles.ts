// Règles du produit, en fonctions pures. Tout ce qui est « hypothèse » ou « règle provisoire » dans les maquettes est une constante ici, au même endroit.
import { arrondi } from './argent.ts';

/** Commission NexG-TT prélevée seulement si la vente a lieu (hypothèse : plage de 10 à 20 % à valider). */
export const TAUX_COMMISSION = 0.125;
export const TAUX_COMMISSION_PASS = 0.10;
/** Abonnement Pass NexG, par mois (hypothèse). */
export const PRIX_PASS = 9.99;
/** Frais de service à l'achat (hypothèse : offerts dans la démo). */
export const FRAIS_SERVICE = 0;
export const FRAIS_TRANSFERT = 0;
export const FRAIS_VERSEMENT = 0;
const H = 3_600_000, J = 24 * H;
/** Dernier moment pour nommer le voyageur et dernier échange possible : 24 h avant le départ (J-1 visé, J-3 à l'étude). */
export const ECHEANCE_HEURES = 24;
/** En dessous de ce délai, un transfert est déconseillé (avertissement) ; en dessous de l'échéance, il est bloqué. */
export const AVERTISSEMENT_TRANSFERT_HEURES = 72;

export const taux = (pass: boolean): number => (pass ? TAUX_COMMISSION_PASS : TAUX_COMMISSION);
export const commission = (prix: number, pass: boolean): number => arrondi(prix * taux(pass));
export const net = (prix: number, pass: boolean): number => arrondi(prix - commission(prix, pass));
/** Plafond de revente : le prix équivalent d'un billet neuf sur ce vol (règle provisoire anti-spéculation). */
export const plafond = (prixNeuf: number): number => prixNeuf;
export const sousPlafond = (prix: number, prixNeuf: number): boolean => prix > 0 && prix <= plafond(prixNeuf);

/** Instant de départ d'un vol (ms), heure locale. */
export const departDe = (jour: string, heure: string): number => Date.parse(`${jour}T${heure}`);
export const echeanceDe = (depart: number): number => depart - ECHEANCE_HEURES * H;
export type Phase = 'ouvert' | 'avertissement' | 'ferme' | 'parti';
/** Où en est un droit par rapport à son échéance (J-1) : les échanges sont ouverts, bientôt fermés, fermés, ou le vol est parti. */
export function phase(depart: number, maintenant: number): Phase {
  if (maintenant >= depart) return 'parti';
  if (maintenant >= echeanceDe(depart)) return 'ferme';
  if (maintenant >= echeanceDe(depart) - (AVERTISSEMENT_TRANSFERT_HEURES - ECHEANCE_HEURES) * H) return 'avertissement';
  return 'ouvert';
}
/** Jours calendaires avant un instant (le départ : « dans 63 jours » ; l'échéance : « J-62 »). */
export function joursAvant(cible: number, maintenant: number): number {
  const a = new Date(cible), b = new Date(maintenant);
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()), db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.max(0, Math.round((da - db) / J));
}
export const peutEchanger = (depart: number, maintenant: number): boolean => maintenant < echeanceDe(depart);
/** Compte à rebours « 4 j 3 h » / « 3 h 12 min » / « 12 min ». */
export function delaiCourt(ms: number): string {
  if (ms <= 0) return '0 min';
  const j = Math.floor(ms / J), h = Math.floor((ms % J) / H), m = Math.floor((ms % H) / 60_000);
  if (j > 0) return `${j} j ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return `${m} min`;
}
/** Estimation (indicative) du délai de vente d'une annonce à un prix donné : plus le prix est bas par rapport au plafond, plus c'est rapide. */
export function delaiVenteEstime(prix: number, prixNeuf: number): number {
  const r = Math.min(1, Math.max(0, prix / prixNeuf));
  return Math.max(1, Math.round(1 + (r - 0.7) * 25));
}
/** Prix suggéré (estimation, non garantie) : environ 82 % du prix équivalent neuf. */
export const prixSuggere = (prixNeuf: number): number => Math.round((prixNeuf * 0.82) / 10) * 10;
/** Référence de droit de voyage, « NXG-7Q2M » : 4 caractères sans ambiguïté. */
export function refAleatoire(graine: number): string {
  const A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; let x = Math.abs(Math.floor(graine)) || 1, s = '';
  for (let i = 0; i < 4; i++) { x = (x * 1103515245 + 12345) % 2147483647; s += A[x % A.length]; }
  return `NXG-${s}`;
}
