// Vue Tableau du Fil : les blocs d'un jour rangés en trois colonnes (prêt, en cours, terminé), côte à côte.
// Un glissement sur une carte la fait avancer (vers la droite) ou reculer (vers la gauche) d'une colonne. Fonctions pures.
import type { BlocVue } from '../../data/requetes.ts';
import type { Jour } from '@core/types.ts';

export type IdColonne = 'pret' | 'encours' | 'termine';

export const COLONNES: { id: IdColonne; titre: string }[] = [
  { id: 'pret', titre: 'Prêt' },
  { id: 'encours', titre: 'En cours' },
  { id: 'termine', titre: 'Terminé' }
];

type Colonnable = Pick<BlocVue, 'fait' | 'enCours' | 'enPause' | 'debutMin' | 'occ'>;

/** Colonne d'un bloc, ou null s'il est ignoré (supprimé de la journée). */
export function colonneDe(b: Colonnable): IdColonne | null {
  if (b.occ.etat === 'ignoree') return null;
  if (b.fait) return 'termine';
  if (b.enCours || b.enPause) return 'encours';
  return 'pret';
}

export function repartir<T extends Colonnable>(blocs: T[]): Record<IdColonne, T[]> {
  const res: Record<IdColonne, T[]> = { pret: [], encours: [], termine: [] };
  for (const b of blocs) { const c = colonneDe(b); if (c) res[c].push(b); }
  for (const c of Object.keys(res) as IdColonne[]) res[c].sort((a, b) => a.debutMin - b.debutMin);
  return res;
}

/** Un bloc prêt dont l'heure de début est passée (jour passé, ou aujourd'hui après le début) : il attend d'être lancé. */
export function enRetard(b: Pick<BlocVue, 'debutMin'>, jour: Jour, aujourdhui: Jour, maintenantMin: number): boolean {
  return jour < aujourdhui || (jour === aujourdhui && b.debutMin <= maintenantMin);
}

export type Geste = 'lancer' | 'terminer' | 'remettre';

/**
 * Ce que fait un glissement depuis une colonne : vers la droite (sens 1) on avance — lancer, puis terminer — ;
 * vers la gauche (sens -1) on recule — un bloc en cours ou terminé redevient prêt. Rien au-delà des bords.
 */
export function gesteDe(colonne: IdColonne, sens: 1 | -1): Geste | null {
  if (sens === 1) return colonne === 'pret' ? 'lancer' : colonne === 'encours' ? 'terminer' : null;
  return colonne === 'encours' || colonne === 'termine' ? 'remettre' : null;
}

/** Colonne d'arrivée annoncée par le geste (aperçu pendant le glissement). */
export function arriveeDe(colonne: IdColonne, sens: 1 | -1): IdColonne | null {
  const g = gesteDe(colonne, sens);
  return g === 'lancer' ? 'encours' : g === 'terminer' ? 'termine' : g === 'remettre' ? 'pret' : null;
}
