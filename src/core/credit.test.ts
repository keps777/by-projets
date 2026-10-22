import { describe, expect, it } from 'vitest';
import { PLAFONDS, capaciteRestante, decider, echeancier, echeancierResume, etatPart, mensualite, niveauDuScore, partSalaire, tauxMensuel } from './credit.ts';

describe('mensualité', () => {
  it('Yaris : 4 M financés, 1,5 %/mois, 36 mois ≈ 144 610 (+ 18 000 d’assurance = 162 610)', () => {
    const m = mensualite(4_000_000, 0.015, 36);
    expect(Math.round(m)).toBe(144_610);
    expect(Math.round(m + 18_000)).toBe(162_610);
  });
  it('taux nul : parts égales ; capital nul : 0', () => {
    expect(mensualite(440_000, 0, 10)).toBe(44_000);
    expect(mensualite(0, 0.015, 12)).toBe(0);
  });
});

describe('échéancier', () => {
  it('rembourse exactement le capital et solde à zéro', () => {
    const t = echeancier(440_000, 0.015, 10);
    expect(t).toHaveLength(10);
    expect(t.reduce((s, l) => s + l.capital, 0)).toBeCloseTo(440_000, 4);
    expect(t.at(-1)!.restant).toBe(0);
    expect(t[0].frais).toBeCloseTo(6_600, 4);
  });
  it('le résumé garde 3 lignes, une ellipse et la dernière', () => {
    const r = echeancierResume(4_000_000, 0.015, 36);
    expect(r.map((l) => (l.ellipse ? '…' : l.n))).toEqual([1, 2, 3, '…', 36]);
  });
});

describe('part du salaire', () => {
  it('seuils : ≤ 25 % confortable, ≤ 33 % limite, au-delà trop lourd', () => {
    expect(etatPart(partSalaire(130_000, 520_000))).toBe('confortable');
    expect(etatPart(partSalaire(171_600, 520_000))).toBe('limite');
    expect(etatPart(partSalaire(172_000, 520_000))).toBe('trop_lourd');
  });
  it('capacité restante : 33 % du salaire moins ce qui est déjà prélevé', () => {
    expect(capaciteRestante(520_000, 69_000)).toBe(171_600 - 69_000);
    expect(capaciteRestante(100_000, 90_000)).toBe(0);
  });
});

describe('niveaux', () => {
  it('seuils 600 / 700 / 800', () => {
    expect([500, 599, 600, 699, 700, 799, 800, 900].map(niveauDuScore)).toEqual(['START', 'START', 'PLUS', 'PLUS', 'PRO', 'PRO', 'ELITE', 'ELITE']);
  });
  it('le crédit auto s’ouvre au niveau Pro (6 M), l’immobilier à Elite', () => {
    expect(PLAFONDS.PLUS.auto).toBe(0);
    expect(PLAFONDS.PRO.auto).toBe(6_000_000);
    expect(PLAFONDS.PRO.immobilier).toBe(false);
    expect(PLAFONDS.ELITE.immobilier).toBe(true);
  });
  it('taux : Premium moins cher, Elite −0,1 pt', () => {
    expect(tauxMensuel('famille', 'PRO')).toBe(0.015);
    expect(tauxMensuel('premium', 'PRO')).toBeLessThan(0.015);
    expect(tauxMensuel('famille', 'ELITE')).toBeCloseTo(0.014);
  });
});

describe('décision', () => {
  // Règle : les mensualités de TOUS les crédits (nouveau compris) ne dépassent pas 33 % du salaire net.
  const base = { score: 742, seuilScore: 700, salaire: 520_000, mensualiteNouvelle: 105_900, mensualitesExistantes: 44_000, employeurPartenaire: true, ancienneteAns: 4, contratStable: true, vehiculeControle: true, valeurExpertisee: 4_800_000, prix: 4_500_000, financement: 3_300_000 };
  it('approuve un dossier sous 33 % (29 % du salaire)', () => {
    const d = decider(base);
    expect(d.approuve).toBe(true);
    expect(d.controles.map((c) => c.id)).toEqual(['score', 'part', 'employeur', 'vehicule']);
    expect(d.controles[1].titre).toContain('29 %');
  });
  it('refuse au-dessus de 33 % ou sous le seuil, en disant pourquoi', () => {
    // La mensualité de la maquette (162 700) + le crédit scolaire (44 000) font 40 % : refusé.
    expect(decider({ ...base, mensualiteNouvelle: 162_700 }).motif).toContain('40 % du salaire');
    expect(decider({ ...base, score: 650 }).motif).toContain('insuffisant');
    expect(decider({ ...base, employeurPartenaire: false }).approuve).toBe(false);
    expect(decider({ ...base, vehiculeControle: false }).approuve).toBe(false);
  });
});
