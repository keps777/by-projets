import { describe, expect, it } from 'vitest';
import { PARTENAIRES, controlerSolde, erreurRecharge, etalementAutorise, extraireCode, fraisRecharge, pointsFacture, referencePaiement, reportPermis, scoreApres, trouverPartenaire, QR_DEMO, SOURCES_RECHARGE } from './paiement.ts';

describe('recharge', () => {
  it('la carte Visa coûte 1 %, le mobile money est gratuit', () => {
    const frais = Object.fromEntries(SOURCES_RECHARGE.map((s) => [s.id, fraisRecharge(25_000, s.frais)]));
    expect(frais).toEqual({ orange: 0, mtn: 0, visa: 250 });
    expect(fraisRecharge(10_050, 0.01)).toBe(101);
  });
  it('refuse les montants vides, trop petits ou trop grands', () => {
    expect(erreurRecharge(null)).toMatch(/montant/i);
    expect(erreurRecharge(0)).toMatch(/montant/i);
    expect(erreurRecharge(500)).toMatch(/Minimum/);
    expect(erreurRecharge(2_000_000)).toMatch(/Maximum/);
    expect(erreurRecharge(25_000)).toBeNull();
  });
});

describe('codes partenaires', () => {
  it('lit le code dans un QR, un code collé ou une saisie imparfaite', () => {
    expect(extraireCode(QR_DEMO)).toBe('CLP-0425');
    expect(extraireCode('clp-0425')).toBe('CLP-0425');
    expect(extraireCode('  CLP 0425 ')).toBe('CLP-0425');
    expect(extraireCode('https://exemple.com/menu')).toBeNull();
    expect(extraireCode('')).toBeNull();
  });
  it('retrouve le partenaire ou refuse un code inconnu', () => {
    expect(trouverPartenaire(QR_DEMO)?.nom).toBe('Clinique Les Palmiers');
    expect(trouverPartenaire('ZZZ-9999')).toBeNull();
    expect(new Set(PARTENAIRES.map((p) => p.code)).size).toBe(PARTENAIRES.length);
  });
});

describe('règlement', () => {
  it('le solde ne peut pas devenir négatif', () => {
    expect(controlerSolde(86_500, 7100)).toEqual({ ok: true });
    expect(controlerSolde(7100, 7100)).toEqual({ ok: true });
    expect(controlerSolde(5000, 7100)).toEqual({ ok: false, manque: 2100 });
    expect(controlerSolde(0, 1)).toEqual({ ok: false, manque: 1 });
  });
  it('référence AM-XXXXXX sans caractère ambigu', () => {
    expect(referencePaiement()).toMatch(/^AM-[A-HJ-NP-Z2-9]{6}$/);
    expect(referencePaiement(() => 0)).toBe('AM-AAAAAA');
    expect(referencePaiement(() => 0.9999)).toBe('AM-999999');
  });
  it('points seulement si la facture est payée à temps, score borné', () => {
    expect(pointsFacture('2026-10-25', '2026-10-22')).toBe(4);
    expect(pointsFacture('2026-10-25', '2026-10-25')).toBe(4);
    expect(pointsFacture('2026-10-25', '2026-10-26')).toBe(0);
    expect(scoreApres(742, 4)).toBe(746);
    expect(scoreApres(899, 4)).toBe(900);
  });
  it("l'étalement respecte la règle des 33 %", () => {
    expect(etalementAutorise(44_000, 2440, 520_000)).toBe(true);
    expect(etalementAutorise(171_000, 600, 520_000)).toBe(true); // 171 600 = 33 % pile
    expect(etalementAutorise(171_000, 601, 520_000)).toBe(false);
    expect(etalementAutorise(0, 100, 0)).toBe(false);
  });
  it('un report par an', () => {
    expect(reportPermis(undefined, '2026-11-28')).toBe(true);
    expect(reportPermis('2026-11-28', '2027-06-28')).toBe(false);
    expect(reportPermis('2026-11-28', '2027-11-28')).toBe(true);
  });
});
