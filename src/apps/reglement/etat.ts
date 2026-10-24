// État propre au règlement : le brouillon du tunnel (siège → paiement → attente → pass) et la cagnotte « bus entier ».
// Tranches persistées avec le monde (voir data/store.svelte.ts) : `reglement` et `groupe`.
import { tranche, aujourdhui } from '../../data/store.svelte.ts';
import { ajouterJours, type Jour } from '../../core/dates.ts';
import type { MoyenChoisi, TailleBus } from '../../core/reglement.ts';
import type { Passager } from '../../domain/types.ts';

export type Nature = 'billet' | 'covoit' | 'groupe';
export interface Proche { id?: string; nom: string; tel: string }
export interface Refus { motif: string; moyen: MoyenChoisi | 'proche' | 'especes'; nature: Nature; ts: number; departId: string | null; /** Paiement refusé (pour le litige « j'ai pourtant été débitée »). */ paiementId?: string | null }
export interface Brouillon {
  nature: Nature;
  // billet
  departId: string | null; sieges: string[]; passagers: Passager[];
  // covoiturage
  covoitId: string | null; places: number;
  // moyen
  moyen: MoyenChoisi; tel: string; visageOk: boolean;
  /** Paiement en cours dans le monde (billet ou covoit) ; absent tant qu'on n'a rien réservé. */
  paiementId: string | null;
  /** Cagnotte : montant de la part et fin de l'attente (pas de Paiement dans le monde avant le bus complet). */
  montant: number; expireLe: number;
  /** Paiement par/pour un proche : `payeur` = null quand c'est la voyageuse qui règle. */
  qui: 'moi' | 'paie_pour' | 'demande'; proche: Proche | null;
  refus: Refus | null;
  /** Billet sans siège attribué (montée en route…) : un seul prix fixé à la réservation. */ sansSiege?: boolean; prixUnitaire?: number;
  /** Utiliser bons de fidélité et cagnotte au paiement (par défaut oui, tant qu'il y en a). */ avantages?: boolean;
}
export interface Partage { ts: number; versNom: string; versTel: string; canal: 'whatsapp' | 'sms'; texte: string; billetId?: string }
export interface EtatReglement { brouillon: Brouillon | null; partages: Partage[]; motifsAnnulation: Record<string, string> }

export const etat = (): EtatReglement => tranche<EtatReglement>('reglement', () => ({ brouillon: null, partages: [], motifsAnnulation: {} }));

export function brouillonVide(init: Partial<Brouillon> = {}): Brouillon {
  return { nature: 'billet', departId: null, sieges: [], passagers: [], covoitId: null, places: 1, moyen: 'momo', tel: '', visageOk: false, paiementId: null, montant: 0, expireLe: 0, qui: 'moi', proche: null, refus: null, ...init };
}

// ------------------------------------------------------------------ cagnotte bus entier
export interface Participant { id: string; nom: string; paye: boolean; ts: number; moi?: boolean; rembourse?: boolean }
export type StatutCagnotte = 'brouillon' | 'ouverte' | 'complete' | 'remboursee';
export interface Cagnotte {
  motif: string; destination: string; jour: Jour; taille: TailleBus; participants: Participant[]; statut: StatutCagnotte;
  lien: string; envoyeLe?: number; creeLe: number; /** Total remboursé quand la cagnotte n'est pas pleine à J-2. */ rembourse?: number;
}
export const JOURS_AVANT_VOYAGE_MIN = 3;
export const defautCagnotte = (): Cagnotte => ({
  motif: 'Mariage à Bafoussam', destination: 'Bafoussam', jour: ajouterJours(aujourdhui(), 21), taille: 50, statut: 'brouillon', lien: '', creeLe: 0,
  participants: [{ id: 'p-aicha', nom: 'Aïcha', paye: false, ts: 0, moi: true }]
});
export const cagnotte = (): Cagnotte => tranche<Cagnotte>('groupe', defautCagnotte);
