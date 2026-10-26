import { describe, expect, it } from 'vitest';
import { commission, delaiCourt, echeanceDe, joursAvant, net, phase, plafond, refAleatoire, sousPlafond } from './regles.ts';

describe('commission et net', () => {
  it('12,5 % sans Pass, 10 % avec : le cas 1 du porteur', () => {
    expect(commission(500, false)).toBe(62.5); expect(net(500, false)).toBe(437.5); expect(commission(500, true)).toBe(50); expect(net(1500, false)).toBe(1312.5);
  });
  it('plafonne la revente au prix équivalent neuf', () => { expect(plafond(2000)).toBe(2000); expect(sousPlafond(2000, 2000)).toBe(true); expect(sousPlafond(2001, 2000)).toBe(false); expect(sousPlafond(0, 2000)).toBe(false); });
});
describe('échéance J-1', () => {
  const depart = Date.parse('2026-12-14T18:05');
  it('ferme les échanges 24 h avant le départ', () => {
    expect(new Date(echeanceDe(depart)).toISOString()).toBe(new Date(Date.parse('2026-12-13T18:05')).toISOString());
    expect(phase(depart, Date.parse('2026-10-12T09:00'))).toBe('ouvert');
    expect(phase(depart, Date.parse('2026-12-12T00:00'))).toBe('avertissement');
    expect(phase(depart, Date.parse('2026-12-13T19:00'))).toBe('ferme');
    expect(phase(depart, Date.parse('2026-12-14T19:00'))).toBe('parti');
  });
  it('compte les jours restants', () => { expect(joursAvant(depart, Date.parse('2026-10-12T09:00'))).toBe(63); expect(joursAvant(echeanceDe(depart), Date.parse('2026-10-12T09:00'))).toBe(62); });
  it('écrit les délais', () => { expect(delaiCourt(3 * 3_600_000 + 12 * 60_000)).toBe('3 h 12 min'); expect(delaiCourt(4 * 86_400_000 + 3 * 3_600_000)).toBe('4 j 3 h'); expect(delaiCourt(0)).toBe('0 min'); });
});
describe('références', () => { it('ont la forme NXG-XXXX', () => { expect(refAleatoire(7)).toMatch(/^NXG-[2-9A-HJ-NP-Z]{4}$/); }); });
