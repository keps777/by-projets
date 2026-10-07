import { describe, expect, it } from 'vitest';
import { delaiAlarme, delaisRappel, libelleDelai, rappelsPlanifies } from './rappels.ts';
import { cleRappelAlarme, rangAlarme } from './ids.ts';

describe('délais de rappel', () => {
  it('réunit le rappel principal et les rappels plus tôt, sans doublon, du plus lointain au plus proche', () => {
    expect(delaisRappel({ rappel_min: 10, rappels_avant_min: [120, 1440, 10] })).toEqual([1440, 120, 10]);
    expect(delaisRappel({ rappel_min: null, rappels_avant_min: [60] })).toEqual([60]);
    expect(delaisRappel({ rappel_min: 0 })).toEqual([0]);
    expect(delaisRappel({ rappel_min: null })).toEqual([]);
  });
  it('écrit les délais comme on les dit', () => {
    expect(libelleDelai(0)).toBe('à l’heure');
    expect(libelleDelai(10)).toBe('10 min');
    expect(libelleDelai(60)).toBe('1 h');
    expect(libelleDelai(120)).toBe('2 h');
    expect(libelleDelai(1440)).toBe('1 jour');
    expect(libelleDelai(1560)).toBe('1 jour et 2 h');
    expect(libelleDelai(2880)).toBe('2 jours');
  });
});

describe('alarme (rappels insistants)', () => {
  it('sans alarme, rien ne s’ajoute aux délais choisis', () => {
    expect(rappelsPlanifies({ rappel_min: 10, rappels_avant_min: [60] })).toEqual([{ delai: 60, rang: 0 }, { delai: 10, rang: 0 }]);
    expect(delaiAlarme({ rappel_min: 10 })).toBeNull();
  });
  it('insiste 5 fois, toutes les 2 min, après le rappel le plus proche du début', () => {
    const l = rappelsPlanifies({ rappel_min: 10, rappels_avant_min: [60], alarme: true });
    expect(l.map((r) => r.delai)).toEqual([60, 10, 8, 6, 4, 2, 0]);
    expect(l.map((r) => r.rang)).toEqual([0, 0, 1, 2, 3, 4, 5]);
    expect(delaiAlarme({ rappel_min: 10, rappels_avant_min: [60], alarme: true })).toBe(10);
  });
  it('une alarme sans délai choisi sonne au début, puis insiste après', () => {
    expect(rappelsPlanifies({ rappel_min: null, alarme: true }).map((r) => r.delai)).toEqual([0, -2, -4, -6, -8, -10]);
    expect(delaiAlarme({ rappel_min: null, alarme: true })).toBe(0);
  });
  it('les clés d’insistance se reconnaissent', () => {
    expect(rangAlarme(cleRappelAlarme('abc', 3))).toBe(3);
    expect(rangAlarme('abc:10')).toBe(0);
  });
});
