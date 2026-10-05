import { describe, expect, it } from 'vitest';
import { delaisRappel, libelleDelai } from './rappels.ts';

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
