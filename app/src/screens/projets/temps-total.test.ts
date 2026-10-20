import { describe, expect, it } from 'vitest';
import type { Metrique, ValeurSaisie } from '@core/types.ts';
import { totauxDeTemps } from './temps-total.ts';

const m = (cle: string, nom: string): Metrique => ({ id: cle, cle, type: 'temps', nom, unite: 'min', cible: null, periode: 'jour', sens: 'plus', dansRapport: true });
const v = (cle: string, jour: string, valeur: number): ValeurSaisie => ({ cle, jour, valeur });

describe('totauxDeTemps', () => {
  const valeurs = [v('temps:priere', '2026-10-05', 3600), v('temps:priere', '2026-10-06', 1800), v('temps:evangelisation', '2026-10-05', 7200), v('temps:evangelisation', '2026-11-01', 999)];
  it('un total par temps (sur la période) et le total général = leur somme', () => {
    const t = totauxDeTemps([m('temps:priere', 'Prière'), m('temps:evangelisation', 'Évangélisation')], valeurs, '2026-10-01', '2026-10-31')!;
    expect(t.lignes.map((l) => [l.m.nom, l.total])).toEqual([['Prière', 5400], ['Évangélisation', 7200]]);
    expect(t.total).toBe(12600);
  });
  it('avec le temps générique parmi les métriques, c’est lui le total', () => {
    const t = totauxDeTemps([m('temps', 'Temps'), m('temps:priere', 'Prière')], [v('temps', '2026-10-05', 10000), v('temps:priere', '2026-10-05', 3000)], '2026-10-01', '2026-10-31')!;
    expect(t.total).toBe(10000);
  });
  it('moins de deux temps : rien à répartir', () => {
    expect(totauxDeTemps([m('temps', 'Temps')], valeurs, '2026-10-01', '2026-10-31')).toBeNull();
  });
});
