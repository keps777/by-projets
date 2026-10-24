import { describe, expect, it } from 'vitest';
import { codeParrain, nbPaliers, palierDe, palierSuivant, pointsAvantBilletOffert, pointsPourBillet, pourcentBilletOffert } from './fidelite.ts';

describe('fidélité', () => {
  it('1 point par 100 F payés', () => { expect(pointsPourBillet(7500)).toBe(75); expect(pointsPourBillet(99)).toBe(0); expect(pointsPourBillet(8099)).toBe(80); expect(pointsPourBillet(-5)).toBe(0); });
  it('paliers selon le cumul', () => {
    expect(palierDe(0).id).toBe('bronze'); expect(palierDe(499).id).toBe('bronze'); expect(palierDe(500).id).toBe('argent'); expect(palierDe(1480).id).toBe('argent');
    expect(palierDe(2000).id).toBe('or'); expect(palierDe(9000).id).toBe('platine'); expect(palierSuivant(1480)?.id).toBe('or'); expect(palierSuivant(5000)).toBeNull(); expect(nbPaliers(1480)).toBe(2);
  });
  it('reste avant le billet offert', () => { expect(pointsAvantBilletOffert(1480)).toBe(520); expect(pointsAvantBilletOffert(2500)).toBe(0); expect(pourcentBilletOffert(1480)).toBe(74); expect(pourcentBilletOffert(5000)).toBe(100); });
  it('code parrain', () => { expect(codeParrain('Aïcha', '691221008', 'p-aicha')).toBe('AICHA-24'); expect(codeParrain('Éloïse', '677001234')).toBe('ELOISE-74'); expect(codeParrain('', '')).toBe('AMI-10'); });
});
