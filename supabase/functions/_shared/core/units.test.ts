import { describe, it, expect } from 'vitest';
import { formatTemps, formatMontant, formatMontantCourt, nombre, formatHeure, parseHeure, dureeLisible, formatDistance } from './units.ts';

describe('unités', () => {
  it('formate le temps comme dans le rapport', () => {
    expect(formatTemps(2 * 3600 + 15 * 60)).toBe('2h15');
    expect(formatTemps(28 * 60, true)).toBe('~0h28');
    expect(formatTemps(0)).toBe('0h00');
    expect(formatTemps(59.6 * 60)).toBe('1h00');
  });
  it('lit la durée', () => {
    expect(dureeLisible(45 * 60)).toBe('45 min');
    expect(dureeLisible(150 * 60)).toBe('2 h 30');
    expect(dureeLisible(3600)).toBe('1 h');
  });
  it('formate les montants à la canadienne', () => {
    expect(formatMontant(138000).replace(/\s/g, ' ')).toBe('1 380,00 $');
    expect(formatMontant(-6840).replace(/\s/g, ' ')).toBe('−68,40 $');
    expect(formatMontantCourt(5000).replace(/\s/g, ' ')).toBe('50 $');
    expect(formatMontantCourt(6840).replace(/\s/g, ' ')).toBe('68,40 $');
  });
  it('écrit les nombres à la française', () => {
    expect(nombre(8.39)).toBe('8,4');
    expect(nombre(3)).toBe('3');
    expect(formatDistance(5000).replace(/\s/g, ' ')).toBe('5 km');
  });
  it('convertit les heures', () => {
    expect(formatHeure(310)).toBe('05:10');
    expect(parseHeure('5:10')).toBe(310);
    expect(parseHeure('25:00')).toBeNull();
  });
});
