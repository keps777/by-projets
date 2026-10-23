import { describe, expect, it } from 'vitest';
import { echeance, estAtteint, evaluerRetrait, interetsSurMois, montantAuto, moisACrediter, partDuMembre, validerCoffre } from './coffres.ts';

describe('intérêts mensuels', () => {
  it('crédite les mois terminés après le dernier crédité', () => {
    expect(moisACrediter('2026-09', '2026-10-22')).toEqual([]);
    expect(moisACrediter('2026-09', '2026-11-01')).toEqual(['2026-10']);
    expect(moisACrediter('2026-08', '2027-01-15')).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
  });
  it('3,5 % par an : 160 000 → 467 par mois, composés', () => {
    const r = interetsSurMois(160_000, 2);
    expect(r.parMois[0]).toBe(467);
    expect(r.parMois[1]).toBe(Math.round(((160_000 + 467) * 0.035) / 12));
    expect(r.solde).toBe(160_000 + r.total);
  });
});
describe('versement automatique', () => {
  it("ne dépasse jamais l'objectif", () => {
    expect(montantAuto(160_000, 600_000, 25_000)).toBe(25_000);
    expect(montantAuto(590_000, 600_000, 25_000)).toBe(10_000);
    expect(montantAuto(600_000, 600_000, 25_000)).toBe(0);
  });
  it("date d'atteinte à partir de la prochaine paie", () => {
    expect(echeance(160_000, 600_000, 25_000, '2026-10-28')).toEqual({ mois: 18, date: '2028-03-01' });
    expect(echeance(600_000, 600_000, 25_000, '2026-10-28')).toEqual({ mois: 0, date: null });
    expect(echeance(0, 600_000, 0, '2026-10-28').date).toBeNull();
  });
  it('part du membre dans un coffre partagé', () => {
    expect(partDuMembre(10_000, true, 4)).toBe(2_500);
    expect(partDuMembre(10_000, false, 4)).toBe(10_000);
  });
});
describe('retrait', () => {
  const base = { epargne: 160_000, objectif: 600_000, urgenceDejaUtilisee: false };
  it('libre une fois atteint', () => {
    const r = evaluerRetrait({ ...base, epargne: 600_000, montant: 100_000 });
    expect(r).toMatchObject({ ok: true, libre: true, penalite: 0, net: 100_000 });
    expect(estAtteint(600_000, 600_000)).toBe(true);
  });
  it("première urgence de l'année gratuite, avec avertissement", () => {
    const r = evaluerRetrait({ ...base, montant: 50_000 });
    expect(r).toMatchObject({ ok: true, urgenceGratuite: true, penalite: 0, net: 50_000 });
    expect(r.avertissement).toContain('seul');
  });
  it('ensuite 2 % de frais', () => {
    const r = evaluerRetrait({ ...base, montant: 50_000, urgenceDejaUtilisee: true });
    expect(r).toMatchObject({ ok: true, penalite: 1_000, net: 49_000 });
  });
  it('refuse montant nul ou supérieur à l’épargne', () => {
    expect(evaluerRetrait({ ...base, montant: 0 }).ok).toBe(false);
    expect(evaluerRetrait({ ...base, montant: 160_001 }).ok).toBe(false);
    expect(evaluerRetrait({ ...base, montant: NaN }).ok).toBe(false);
  });
});
describe('validation', () => {
  const ok = { nom: 'Mariage', objectif: 1_000_000, mensuel: 50_000, partage: false, membres: 4 };
  it('accepte une saisie correcte', () => expect(validerCoffre(ok)).toEqual({}));
  it('refuse nom vide, objectif ou versement invalides', () => {
    expect(validerCoffre({ ...ok, nom: '   ' }).nom).toBeTruthy();
    expect(validerCoffre({ ...ok, objectif: 500 }).objectif).toBeTruthy();
    expect(validerCoffre({ ...ok, mensuel: 0 }).mensuel).toBeTruthy();
    expect(validerCoffre({ ...ok, mensuel: 2_000_000 }).mensuel).toBeTruthy();
    expect(validerCoffre({ ...ok, partage: true, membres: 1 }).membres).toBeTruthy();
  });
});
