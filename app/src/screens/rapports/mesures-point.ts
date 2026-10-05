// Mesures d'un point du rapport, prêtes à être saisies : métriques lisibles, sans doublon, et période de leur objectif.
import { TYPES } from '@core/metriques.ts';
import type { Jour, Metrique } from '@core/types.ts';
import type { PointRapportLigne } from '@core/lignes.ts';
import { configDeMesure, type DonneesRapport } from './calcul.ts';

/** Nom d'une mesure sans sous-projet : « Nombre de fois », « Temps », « Chapitres »… (la clé « nombre:chapitres » donne « Chapitres »). */
export function nomLisible(type: string, cle: string): string {
  if (type === 'fois') return 'Nombre de fois';
  if (type === 'nombre') { const u = cle.split(':')[1] ?? 'nombre'; return u.charAt(0).toUpperCase() + u.slice(1); }
  return TYPES[type as keyof typeof TYPES]?.nom ?? cle;
}

export interface MesuresDuPoint { metriques: Metrique[]; periode: { debut: Jour; fin: Jour | null } }

export function mesuresDuPoint(point: PointRapportLigne, d: DonneesRapport, debut: Jour, fin: Jour): MesuresDuPoint {
  const configs = (point.mesures ?? []).map((m) => configDeMesure(m, point, d, debut, fin));
  const vus = new Set<string>();
  const metriques = configs
    .map((c) => ({ ...c.metrique, id: c.metrique.id || c.metrique.cle, nom: c.metrique.id ? c.metrique.nom : nomLisible(c.metrique.type, c.metrique.cle) }))
    .filter((m) => (vus.has(m.cle) ? false : (vus.add(m.cle), true)));
  const sp = configs[0]?.sousProjet;
  return { metriques, periode: sp ? { debut: sp.debut, fin: sp.fin ?? null } : { debut, fin: null } };
}
