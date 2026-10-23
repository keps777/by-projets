import { describe, expect, it } from 'vitest';
import { mensualite } from './credit.ts';
import { dureeAlternative, evaluerPlan, lireCoffreRentree, mensualitePlan, montantMaxFinancable, type EntreePlan } from './ecole-plan.ts';
import { appreciation, lireNote, synthese } from './bulletin.ts';

const aicha: EntreePlan = { aFinancer: 440_000, duree: 10, pass: 'famille', score: 742, salaire: 520_000, mensualitesExistantes: 44_000 };

describe('plan de paiement école', () => {
  it("l'annuité exacte à 1,5 %/mois sur 10 mois pour 440 000 est 47 711 (pas les 44 000 de la maquette)", () => {
    expect(mensualitePlan(440_000, 0.015, 10)).toBe(47_711);
    expect(mensualitePlan(440_000, 0, 10)).toBe(44_000);
  });
  it('taux par Pass et niveau : Famille PRO 1,5 %, Premium 1,2 %', () => {
    expect(evaluerPlan(aicha).taux).toBe(0.015);
    expect(evaluerPlan({ ...aicha, pass: 'premium' }).taux).toBe(0.012);
    expect(evaluerPlan({ ...aicha, pass: 'essentiel' }).taux).toBe(0.018);
  });
  it('Aïcha : accepté, (44 000 + 47 711) / 520 000 = 17,6 %', () => {
    const r = evaluerPlan(aicha);
    expect(r.approuve).toBe(true);
    expect(r.mensualite).toBe(47_711);
    expect(r.part).toBeCloseTo(91_711 / 520_000, 6);
    expect(r.cout).toBe(47_711 * 10 - 440_000);
    expect(r.controles.map((c) => c.id)).toEqual(['score', 'part', 'plafond']);
  });
  it('règle des 33 % : somme de TOUTES les mensualités ≤ 33 % du net', () => {
    // 33 % de 520 000 = 171 600
    const limite = evaluerPlan({ ...aicha, taux: 0, aFinancer: 1_276_000, duree: 10, mensualitesExistantes: 44_000 });
    expect(limite.mensualite).toBe(127_600); expect(limite.approuve).toBe(true); // 171 600 pile
    const trop = evaluerPlan({ ...aicha, taux: 0, aFinancer: 1_277_000, duree: 10, mensualitesExistantes: 44_000 });
    expect(trop.approuve).toBe(false); expect(trop.motif).toMatch(/33|Mensualités totales/);
  });
  it('refus puis durée plus longue proposée', () => {
    const e: EntreePlan = { ...aicha, aFinancer: 900_000, duree: 6, mensualitesExistantes: 44_000 };
    const r = evaluerPlan(e);
    expect(r.approuve).toBe(false);
    const d = dureeAlternative(e)!;
    expect(d).toBeGreaterThan(6);
    expect(evaluerPlan({ ...e, duree: d }).approuve).toBe(true);
    for (const plusCourt of [6, 8, 10].filter((x) => x > e.duree && x < d)) expect(evaluerPlan({ ...e, duree: plusCourt }).approuve).toBe(false);
  });
  it('aucune durée ne passe : null, et le montant maximal finançable respecte 33 %', () => {
    const e: EntreePlan = { ...aicha, aFinancer: 3_000_000, duree: 6 };
    expect(dureeAlternative(e)).toBeNull();
    const max = montantMaxFinancable(e.salaire, e.mensualitesExistantes, 0.015, 12);
    expect(max).toBeGreaterThan(0);
    expect(evaluerPlan({ ...e, aFinancer: max, duree: 12 }).approuve).toBe(true);
    expect(evaluerPlan({ ...e, aFinancer: max + 1_000, duree: 12 }).approuve).toBe(false);
    expect(montantMaxFinancable(100_000, 50_000, 0.015, 12)).toBe(0);
  });
  it('score trop bas et plafond du niveau', () => {
    expect(evaluerPlan({ ...aicha, score: 480 }).approuve).toBe(false);
    const plafond = evaluerPlan({ ...aicha, score: 520, aFinancer: 600_000, salaire: 5_000_000, mensualitesExistantes: 0 });
    expect(plafond.plafondOk).toBe(false); expect(plafond.approuve).toBe(false);
  });
  it('rien à financer : pas de plan', () => { expect(evaluerPlan({ ...aicha, aFinancer: 0 }).approuve).toBe(false); });
  it('cohérent avec core/credit', () => { expect(mensualitePlan(250_000, 0.012, 8)).toBe(Math.round(mensualite(250_000, 0.012, 8))); });
});

describe('coffre Rentrée en lecture seule', () => {
  it('trouve un coffre dont le nom contient « Rentrée »', () => {
    expect(lireCoffreRentree({ coffres: [{ nom: 'Voyage', solde: 5 }, { nom: 'Coffre Rentrée 2027', solde: 160_000 }] })).toBe(160_000);
    expect(lireCoffreRentree([{ libelle: 'rentree', montant: 42 }])).toBe(42);
  });
  it('null sans tel coffre', () => {
    expect(lireCoffreRentree(undefined)).toBeNull();
    expect(lireCoffreRentree({ coffres: [{ nom: 'Voyage', solde: 5 }] })).toBeNull();
  });
});

describe('notes et bulletin', () => {
  it('lecture des notes', () => {
    expect(lireNote('')).toEqual({ etat: 'vide' });
    expect(lireNote('11,5')).toEqual({ etat: 'ok', valeur: 11.5 });
    expect(lireNote('20')).toEqual({ etat: 'ok', valeur: 20 });
    for (const t of ['21', '-1', 'abc', '12,555', '1e1']) expect(lireNote(t).etat).toBe('invalide');
  });
  it('appréciations', () => {
    expect(appreciation('9')).toBe('Soutien conseillé'); expect(appreciation('15')).toBe('Bon travail'); expect(appreciation('16')).toBe('Très bien');
    expect(appreciation('25')).toBe('Note invalide'); expect(appreciation('')).toBe('');
  });
  it('moyennes, moyenne de classe, rang ; seules les évaluations publiées comptent', () => {
    const roster = ['A', 'B', 'C'];
    const evals = [
      { matiere: 'Maths', intitule: 'D1', publie: true, notes: { A: '16', B: '10', C: '12' } },
      { matiere: 'Maths', intitule: 'D2', publie: true, notes: { A: '14', B: '12', C: '' } },
      { matiere: 'Maths', intitule: 'D3', publie: false, notes: { A: '0', B: '20', C: '20' } },
      { matiere: 'Français', intitule: 'D1', publie: true, notes: { A: '10', B: '14', C: '11' } }
    ];
    const s = synthese(evals, 'A', roster);
    expect(s.matieres.map((m) => [m.matiere, m.moyenne])).toEqual([['Maths', 15], ['Français', 10]]);
    expect(s.matieres[0].moyenneClasse).toBeCloseTo((16 + 10 + 12 + 14 + 12) / 5);
    expect(s.moyenne).toBe(12.5);
    expect(s.rang).toBe(1); // B : (11 + 14) / 2 = 12,5 ; égalité : même rang
    expect(synthese(evals, 'C', roster).rang).toBe(3);
    expect(synthese(evals, 'Z', roster).moyenne).toBeNull();
  });
});
