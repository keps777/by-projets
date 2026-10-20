// Total du temps d'un sous-projet qui suit plusieurs temps (prière, évangélisation, travaux pratiques…) : un total par temps et un total général.
import { TYPES, agreger, valeursEntre } from '@core/metriques.ts';
import type { Jour, Metrique, ValeurSaisie } from '@core/types.ts';

export interface LigneTemps { m: Metrique; /** Secondes réalisées sur la période. */ total: number }
export interface TotauxTemps { lignes: LigneTemps[]; total: number }

/**
 * Un total par métrique de temps, et le total général. Le temps générique (`temps`) est le total enregistré par les blocs, les chronos et
 * les saisies : s'il fait partie des métriques, c'est lui le total ; sinon le total est la somme des temps nommés.
 * Rien (null) quand le sous-projet ne suit pas au moins deux temps : il n'y a alors rien à répartir.
 */
export function totauxDeTemps(metriques: Metrique[], valeurs: ValeurSaisie[], debut: Jour, fin: Jour): TotauxTemps | null {
  const temps = metriques.filter((m) => m.type === 'temps');
  if (temps.length < 2) return null;
  const lignes = temps.map((m) => ({ m, total: agreger(TYPES[m.type].agregation === 'somme' ? m.type : 'temps', valeursEntre(valeurs, m.cle, debut, fin)) ?? 0 }));
  const generique = lignes.find((l) => l.m.cle === 'temps');
  return { lignes, total: generique ? generique.total : lignes.reduce((s, l) => s + l.total, 0) };
}
