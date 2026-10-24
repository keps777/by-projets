// État propre au superviseur : tranche persistée (démo amorcée, rapports envoyés, clôtures, suspensions du jour) et horloge réactive.
import { app, maintenant, tranche } from '../../data/store.svelte.ts';
import type { Personne } from '../../domain/types.ts';

export interface TrancheSup {
  /** Gares dont la journée de démonstration a été amorcée. */ demos: Record<string, boolean>;
  /** Rapports du soir envoyés, par `gare|jour`. */ rapports: Record<string, { envoyeLe: number; par: string; texte: string; via: 'whatsapp' | 'partage' }>;
  /** Clôtures de gare, par `gare|jour`. */ clotures: Record<string, { ts: number; par: string; tardive: boolean; retardMin: number }>;
  /** Comptes suspendus « pour la journée » : personne → jour de la suspension. */ suspensions: Record<string, string>;
}
const vide = (): TrancheSup => ({ demos: {}, rapports: {}, clotures: {}, suspensions: {} });
/** À appeler depuis une action ou un `onMount`, jamais d'un `$derived` (la création modifie l'état). */
export const creerTranche = (): TrancheSup => tranche<TrancheSup>('superviseur', vide);
/** Lecture seule, sûre dans un `$derived` : rend une tranche vide tant que rien n'a été écrit. */
export const lireTranche = (): TrancheSup => (app.tranches.superviseur as TrancheSup | undefined) ?? vide();
export const cleJour = (gareId: string, jour: string) => `${gareId}|${jour}`;

/** Horloge réactive : `horloge.t` change toutes les 15 s, les `$derived` qui la lisent se recalculent avec le monde. */
export const horloge = $state({ t: maintenant() });
export const rafraichir = () => { horloge.t = maintenant(); };

/** Gare suivie : celle du superviseur ; le patron (sans gare) choisit par `?gare=`, Mvan par défaut. */
export function gareSuivie(p: Personne | undefined, surcharge?: string | null): string {
  if (p?.role !== 'patron' && p?.gareId) return p.gareId;
  return surcharge && app.monde.gares.some((g) => g.id === surcharge) ? surcharge : p?.gareId ?? 'mvan';
}
