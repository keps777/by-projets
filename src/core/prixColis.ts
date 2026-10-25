// Prix d'un colis selon la ligne : tarif de base par taille (core/colis.ts) × facteur de distance tiré de la durée du trajet, arrondi à 100 F.
// Règles de transport : un bus prend toutes les tailles ; un covoiturage prend S par défaut, S et M s'il l'annonce (`colisOk: true`), rien s'il refuse (`colisOk: false`).
import { TAILLES } from './colis.ts';

export type TailleColis = keyof typeof TAILLES;
export const TAILLES_COLIS = ['S', 'M', 'L'] as const satisfies readonly TailleColis[];
/** Durée de référence (min) : un Yaoundé → Douala moyen. À cette durée, le prix est le tarif de base. */
export const DUREE_REFERENCE_MIN = 220;
export const FACTEUR_MIN = 0.6, FACTEUR_MAX = 1.8;

/** Facteur de distance de la ligne : durée / référence, borné et arrondi au centième. */
export const facteurDistance = (dureeMin: number): number => Math.round(Math.min(FACTEUR_MAX, Math.max(FACTEUR_MIN, dureeMin / DUREE_REFERENCE_MIN)) * 100) / 100;
export const arrondi100 = (n: number): number => Math.round(n / 100) * 100;
/** Prix du colis (sans options) sur une ligne qui dure `dureeMin` minutes. */
export const prixColisLigne = (taille: TailleColis, dureeMin: number): number => arrondi100(TAILLES[taille].prix * facteurDistance(dureeMin));

export interface TransporteurColis { genre: 'bus' | 'cv'; /** Covoiturage : accepte les petits colis (S et M). Absent : seulement S. */ colisOk?: boolean }
export function accepteColis(o: TransporteurColis, taille: TailleColis): boolean {
  if (o.genre === 'bus') return true;
  if (o.colisOk === false) return false;
  return taille === 'S' || (o.colisOk === true && taille === 'M');
}
/** Durée annoncée de la livraison à l'arrivée (retard compris). */
export const livraisonMin = (dureeMin: number, retardMin = 0): number => dureeMin + Math.max(0, retardMin);
