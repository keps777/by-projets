import { describe, expect, it } from 'vitest';
import { calculerRemise } from './remise.ts';

describe('remise au paiement', () => {
  it('un bon de 500 F se déduit du total', () => { expect(calculerRemise(7000, [500], 0)).toEqual({ bons: 1, bon: 500, cagnotte: 0, total: 500 }); });
  it('le bon puis la cagnotte', () => { expect(calculerRemise(7000, [500], 1200)).toEqual({ bons: 1, bon: 500, cagnotte: 1200, total: 1700 }); });
  it('jamais plus que le total moins le minimum', () => { const r = calculerRemise(1000, [500, 500], 5000); expect(r.total).toBe(500); expect(1000 - r.total).toBeGreaterThanOrEqual(500); });
  it('un bon qui ne rentre pas est gardé', () => { expect(calculerRemise(900, [500], 0).bons).toBe(0); });
  it('sans avantage, aucune remise', () => { expect(calculerRemise(7000, [], 0).total).toBe(0); });
});
