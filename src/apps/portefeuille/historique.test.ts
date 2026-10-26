import { describe, expect, it } from 'vitest';
import { etatInitial } from '../../data/seed.ts';
import { historiquePf, pointsSvg } from './historique.ts';

const NOW = Date.parse('2026-10-12T09:00'), ALEX = 'ACC-0412';
describe('historiquePf (variante PC du portefeuille)', () => {
  const m = etatInitial().monde, h = historiquePf(m, ALEX, NOW)!;
  it('part du premier achat et finit aujourd’hui ; titre et paliers lisibles', () => {
    expect(h.titre).toBe('Depuis le premier achat · 12 janv. → 12 oct. 2026');
    expect(h.paliers).toMatch(/^Paliers : achats du 12 janv\. \(YUL → CDG\)/); expect(h.paliers).toContain('(YUL → PPT, revente)'); expect(h.paliers).toContain('(YUL → PUJ, Drop)');
  });
  it('le montant payé finit à 3 050 $ et le prix équivalent à 4 730 $ ; l’axe couvre les deux', () => {
    expect(h.paye.at(-1)![1]).toBe(3050); expect(h.equiv.at(-1)![1]).toBe(4730); expect(h.paye[0][1]).toBe(1000);
    expect(h.max).toBeGreaterThanOrEqual(4730); expect(h.graduations).toEqual([5000, 4000, 3000, 2000, 1000]);
  });
  it('les repères de mois commencent à gauche, restent avant la fin', () => {
    expect(h.mois[0]).toEqual({ pct: 0, lib: 'janv.' }); expect(h.mois.every((x) => x.pct <= 0.8)).toBe(true);
  });
  it('sans droit actif : pas d’historique ; la marche du montant payé double les points', () => {
    expect(historiquePf(m, 'ACC-inconnu', NOW)).toBeNull();
    expect(pointsSvg([[0, 100], [1, 200]], 1000).split(' ')).toHaveLength(2); expect(pointsSvg([[0, 100], [1, 200]], 1000, true).split(' ')).toHaveLength(3);
  });
});
