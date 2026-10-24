import { describe, expect, it } from 'vitest';
import { OFFRES, PART_MAX, capitalPour, mensualite, offreParId, scoreConfiance, simuler } from './financement.ts';

describe('simulateur de financement', () => {
  it('annuité constante : valeurs de référence', () => {
    expect(mensualite(5_000_000, 1.8, 6)).toBe(886_614);
    expect(mensualite(1_500_000, 0, 4)).toBe(375_000);
    expect(mensualite(38_000_000, 9.5 / 12, 36)).toBeGreaterThan(1_210_000); expect(mensualite(38_000_000, 9.5 / 12, 36)).toBeLessThan(1_220_000);
    expect(mensualite(0, 2, 12)).toBe(0); expect(mensualite(1000, 2, 0)).toBe(0);
  });
  it('capitalPour est l’inverse de la mensualité', () => {
    const k = 12_345_000, m = mensualite(k, 0.79, 36);
    expect(Math.abs(capitalPour(m, 0.79, 36) - k)).toBeLessThan(100); expect(capitalPour(100_000, 0, 10)).toBe(1_000_000); expect(capitalPour(0, 1, 10)).toBe(0);
  });
  it('le bus : l’apport de 15 % est déduit du capital financé', () => {
    const o = offreParId('bus-70')!, s = simuler(o, { montant: 38_000_000, duree: 36, recetteMensuelle: 10_000_000 });
    expect(s.apport).toBe(5_700_000); expect(s.finance).toBe(32_300_000); expect(s.mensualite).toBe(mensualite(32_300_000, 9.5 / 12, 36));
    expect(s.total).toBe(s.mensualite * 36 + s.apport); expect(s.cout).toBe(s.mensualite * 36 - s.finance); expect(s.partRecette).toBeCloseTo(10.3, 0);
  });
  it('plafond : la mensualité ne dépasse pas 20 % de la recette mensuelle', () => {
    const o = offreParId('bus-70')!, riche = simuler(o, { montant: 38_000_000, duree: 36, recetteMensuelle: 10_000_000 }), pauvre = simuler(o, { montant: 38_000_000, duree: 36, recetteMensuelle: 2_000_000 });
    expect(PART_MAX).toBe(0.2); expect(riche.depasse).toBe(false);
    expect(pauvre.depasse).toBe(true); expect(pauvre.raison).toContain('dépasse'); expect(pauvre.plafond).toBeLessThan(38_000_000);
    expect(mensualite(pauvre.plafond - pauvre.apport, o.tauxMensuelPct, 36)).toBeLessThanOrEqual(400_000);
  });
  it('montant minimum, durée imposée et recettes absentes', () => {
    const o = offreParId('roulement')!;
    expect(simuler(o, { montant: 100_000, duree: 6, recetteMensuelle: 10_000_000 }).raison).toContain('minimum');
    expect(simuler(o, { montant: 3_000_000, duree: 99, recetteMensuelle: 10_000_000 }).duree).toBe(6);
    expect(simuler(o, { montant: 99_000_000, duree: 6, recetteMensuelle: 10_000_000 }).montant).toBe(5_000_000);
    expect(simuler(o, { montant: 3_000_000, duree: 6, recetteMensuelle: 0 }).raison).toContain('recettes');
    expect(OFFRES.map((x) => x.id)).toEqual(['bus-70', 'roulement', 'entretien']);
  });
  it('score de confiance : régularité, écarts, ponctualité ; éligible avec 7 jours de recettes et 60 points', () => {
    const bon = scoreConfiance({ recettesJour: Array(14).fill(500_000).map((x, i) => x + (i % 2) * 20_000), ecartsAbs: 3000, recetteCaisses: 1_000_000, departsPartis: 100, departsAHeure: 94 });
    expect(bon.eligible).toBe(true); expect(bon.score).toBeGreaterThan(85); expect(bon.ponctualitePct).toBe(94); expect(bon.ecartsPct).toBe(0.3);
    const court = scoreConfiance({ recettesJour: [500_000, 400_000, 0], ecartsAbs: 0, recetteCaisses: 0, departsPartis: 0, departsAHeure: 0 });
    expect(court.eligible).toBe(false); expect(court.jours).toBe(2);
    expect(scoreConfiance({ recettesJour: [], ecartsAbs: 0, recetteCaisses: 0, departsPartis: 0, departsAHeure: 0 })).toMatchObject({ score: 0, eligible: false });
    const irregulier = scoreConfiance({ recettesJour: [900_000, 50_000, 800_000, 20_000, 700_000, 10_000, 600_000, 30_000], ecartsAbs: 50_000, recetteCaisses: 500_000, departsPartis: 10, departsAHeure: 5 });
    expect(irregulier.eligible).toBe(false);
  });
});
