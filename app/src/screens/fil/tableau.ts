// Vue Tableau du Fil : les blocs d'un jour rangés en quatre colonnes (prêtes, à faire, en cours, terminées).
// Un glissement sur une carte la fait avancer (vers la droite) ou reculer (vers la gauche) d'une colonne. Fonctions pures.
import type { BlocVue } from '../../data/requetes.ts';
import type { Jour } from '@core/types.ts';

export type IdColonne = 'pretes' | 'afaire' | 'encours' | 'terminees';

export const COLONNES: { id: IdColonne; titre: string; aide: string }[] = [
  { id: 'pretes', titre: 'Prêtes', aide: 'Prévues plus tard : rien à faire pour l’instant.' },
  { id: 'afaire', titre: 'À faire', aide: 'L’heure est venue (ou passée) : à lancer.' },
  { id: 'encours', titre: 'En cours', aide: 'Un minuteur tourne ou attend.' },
  { id: 'terminees', titre: 'Terminées', aide: 'Faites : glisse à gauche pour rouvrir.' }
];

/** Colonne d'un bloc, ou null s'il est ignoré (supprimé de la journée). */
export function colonneDe(b: Pick<BlocVue, 'fait' | 'enCours' | 'enPause' | 'debutMin' | 'occ'>, jour: Jour, aujourdhui: Jour, maintenantMin: number): IdColonne | null {
  if (b.occ.etat === 'ignoree') return null;
  if (b.fait) return 'terminees';
  if (b.enCours || b.enPause) return 'encours';
  if (jour < aujourdhui) return 'afaire';
  if (jour > aujourdhui) return 'pretes';
  return b.debutMin > maintenantMin ? 'pretes' : 'afaire';
}

export function repartir<T extends Pick<BlocVue, 'fait' | 'enCours' | 'enPause' | 'debutMin' | 'occ'>>(blocs: T[], jour: Jour, aujourdhui: Jour, maintenantMin: number): Record<IdColonne, T[]> {
  const res: Record<IdColonne, T[]> = { pretes: [], afaire: [], encours: [], terminees: [] };
  for (const b of blocs) { const c = colonneDe(b, jour, aujourdhui, maintenantMin); if (c) res[c].push(b); }
  for (const c of Object.keys(res) as IdColonne[]) res[c].sort((a, b) => a.debutMin - b.debutMin);
  return res;
}

export type Geste = 'lancer' | 'terminer' | 'remettre';

/**
 * Ce que fait un glissement depuis une colonne : vers la droite (sens 1) on avance — lancer, puis terminer — ;
 * vers la gauche (sens -1) on recule — un bloc en cours ou terminé redevient « à faire ». Rien au-delà des bords.
 */
export function gesteDe(colonne: IdColonne, sens: 1 | -1): Geste | null {
  if (sens === 1) return colonne === 'pretes' || colonne === 'afaire' ? 'lancer' : colonne === 'encours' ? 'terminer' : null;
  return colonne === 'encours' || colonne === 'terminees' ? 'remettre' : null;
}

/** Colonne d'arrivée annoncée par le geste (pour l'aperçu pendant le glissement). */
export function arriveeDe(colonne: IdColonne, sens: 1 | -1): IdColonne | 'afaire_ou_pretes' | null {
  const g = gesteDe(colonne, sens);
  return g === 'lancer' ? 'encours' : g === 'terminer' ? 'terminees' : g === 'remettre' ? 'afaire_ou_pretes' : null;
}
