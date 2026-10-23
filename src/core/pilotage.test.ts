import { describe, expect, it } from 'vitest';
import {
  arcJauge, calculer, cheminCourbe, csvPilotage, depasseSeuil, distributionPart, echelle, encoursParProduit, encoursRestant, entreeVide, fluxPaie, indexClassePart, periodeDe,
  pointsCourbe, posteDePaie, repartir, repartitionNiveaux, reportsDePaie, totalCoffres, volumeSante, type BasePopulation, type CreditLu, type EntreeLocale
} from './pilotage.ts';
import { BASE } from '../portals/pilotage/base.ts';

const NOW = new Date(2026, 9, 23, 10).getTime();
const cr = (p: Partial<CreditLu> = {}): CreditLu => ({ produit: 'ecole', capital: 440_000, mensualite: 44_000, duree: 10, payees: 2, statut: 'actif', ...p });
const aicha = (): EntreeLocale => ({
  ...entreeVide(), compte: { salaireNet: 520_000, cree: new Date(2025, 8, 1).getTime() }, score: 742, credits: [cr()],
  mouvements: [
    { ts: new Date(2026, 9, 1, 9).getTime(), titre: 'Salaire reçu', montant: 520_000, categorie: 'salaire' },
    { ts: new Date(2026, 9, 1, 9).getTime(), titre: 'Mensualité école 2 / 10', montant: -44_000, categorie: 'ecole' },
    { ts: new Date(2026, 9, 1, 9).getTime(), titre: 'Coffre Rentrée', montant: -12_500, categorie: 'coffre' },
    { ts: new Date(2026, 8, 1, 9).getTime(), titre: 'Salaire reçu', montant: 520_000, categorie: 'salaire' }
  ],
  notifications: [{ titre: 'Salaire reçu, prélèvements faits', sous: '56 500 prélevés · 1 reporté' }, { titre: 'Salaire reçu, prélèvements faits', sous: '56 500 prélevés' }]
});

describe('utilitaires', () => {
  it('répartir garde la somme exacte', () => {
    expect(repartir([3610, 3480, 2390, 2240, 240], 11610).reduce((a, b) => a + b, 0)).toBe(11610);
    expect(repartir([1, 1, 1], 100).reduce((a, b) => a + b, 0)).toBe(100);
    expect(repartir([0, 0], 10)).toEqual([0, 0]);
  });
  it('période : mois civils, changement d\'année', () => {
    expect(periodeDe(NOW, 0)).toMatchObject({ cle: '2026-10', libelle: 'octobre 2026', debut: '2026-10-01', fin: '2026-11-01' });
    expect(periodeDe(new Date(2026, 0, 15).getTime(), 2)).toMatchObject({ cle: '2025-11', fin: '2025-12-01' });
  });
});

describe('crédits', () => {
  it('capital restant dû, linéaire ; terminé = 0', () => {
    expect(encoursRestant(cr())).toBe(352_000);
    expect(encoursRestant(cr({ statut: 'termine' }))).toBe(0);
    expect(encoursRestant(cr({ payees: 12 }))).toBe(0);
    expect(encoursRestant(cr({ duree: 0 }))).toBe(0);
  });
  it('encours par produit ignore les produits inconnus', () => {
    const r = encoursParProduit([cr(), cr({ produit: 'auto', capital: 1_000_000, payees: 0 }), cr({ produit: 'inconnu' })]);
    expect(r.ecole).toBe(352_000); expect(r.auto).toBe(1_000_000); expect(r.sante).toBe(0);
  });
});

describe('part de salaire et règle des 33 %', () => {
  it('33 % pile n\'est pas une alerte ; 33,01 % l\'est', () => {
    expect(indexClassePart(33_000, 100_000)).toBe(3);
    expect(indexClassePart(33_010, 100_000)).toBe(4);
    expect(indexClassePart(10_000, 100_000)).toBe(0);
    expect(indexClassePart(25_000, 100_000)).toBe(2);
    expect(indexClassePart(25_001, 100_000)).toBe(3);
    expect(indexClassePart(1, 0)).toBe(4);
  });
  it('distribution : base + locaux, alertes et taux', () => {
    const d = distributionPart([10, 10, 10, 10, 10], [{ salaire: 520_000, mensualites: 44_000 }, { salaire: 100_000, mensualites: 40_000 }, { salaire: 100_000, mensualites: 0 }]);
    expect(d.total).toBe(52); expect(d.alertes).toBe(11); expect(d.tauxAlerte).toBe(21.2);
    expect(d.classes[0].local).toBe(1); expect(d.classes[4].local).toBe(1);
  });
});

describe('score, retards, reports', () => {
  it('niveaux : seuils 600 / 700 / 800', () => {
    const r = repartitionNiveaux({ START: 1, PLUS: 1, PRO: 1, ELITE: 1 }, [599, 600, 742, 800, 900]);
    expect(r.lignes.map((l) => l.effectif)).toEqual([2, 2, 2, 3]); expect(r.total).toBe(9);
  });
  it('seuil : strictement au-dessus', () => { expect(depasseSeuil(3, 3)).toBe(false); expect(depasseSeuil(3.1, 3)).toBe(true); });
  it('reports relus dans les notifications de paie', () => {
    expect(reportsDePaie(aicha().notifications)).toEqual({ paies: 2, paiesAvecReport: 1, reports: 1 });
    expect(reportsDePaie([{ titre: 'Autre', sous: '2 reporté' }])).toEqual({ paies: 0, paiesAvecReport: 0, reports: 0 });
  });
});

describe('santé, coffres, paie', () => {
  const f = (p: object) => ({ statut: 'payee', date: '2026-10-05', echeance: '2026-10-20', total: 20_000, assureMe: 14_000, partPatient: 6_000, ...p });
  it('volume du mois, retards, brouillons exclus', () => {
    const v = volumeSante([f({}), f({ statut: 'a_regler', echeance: '2026-10-10' }), f({ statut: 'brouillon' }), f({ date: '2026-09-30' }), f({ aTemps: false })], '2026-10-01', '2026-11-01', '2026-10-23');
    expect(v).toMatchObject({ factures: 3, volume: 60_000, assureMe: 42_000, partPatient: 18_000, reglees: 2, enRetard: 2, tauxRetard: 66.7 });
  });
  it('coffres : total épargné, versements automatiques seulement', () => {
    expect(totalCoffres([{ epargne: 12_500, objectif: 100_000, mensuel: 12_500, auto: true }, { epargne: 5_000, objectif: 50_000, mensuel: 5_000, auto: false }])).toEqual({ nb: 2, epargne: 17_500, objectif: 150_000, mensuel: 12_500 });
  });
  it('postes de paie', () => {
    expect(posteDePaie({ ts: 0, titre: 'x', montant: 1, categorie: 'salaire' })).toBe('salaires');
    expect(posteDePaie({ ts: 0, titre: 'Coffre', montant: 5, categorie: 'coffre' })).toBeNull();
    expect(posteDePaie({ ts: 0, titre: 'Mensualité école', montant: -1, categorie: 'ecole' })).toBe('credits');
    expect(posteDePaie({ ts: 0, titre: 'Pharmacie', montant: -1, categorie: 'sante' })).toBeNull();
  });
  it('flux de paie sur 3 mois', () => {
    const p = fluxPaie(aicha().mouvements, periodeDe(NOW, 0), 3);
    expect(p.map((x) => x.cle)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(p[2]).toMatchObject({ salaires: 520_000, credits: 44_000, coffres: 12_500, pass: 0 }); expect(p[1].salaires).toBe(520_000); expect(p[0].salaires).toBe(0);
  });
});

describe('tracés', () => {
  it('échelle ronde', () => {
    expect(echelle(980)).toEqual({ max: 1000, graduations: [0, 500, 1000] });
    expect(echelle(0)).toEqual({ max: 1, graduations: [0, 1] });
    expect(echelle(2.84e9).max).toBeGreaterThanOrEqual(2.84e9);
  });
  it('courbe : bas à gauche, haut à droite', () => {
    const pts = pointsCourbe([0, 10], { x0: 0, x1: 100, y0: 200, y1: 0 }, 10);
    expect(pts).toEqual([{ x: 0, y: 200 }, { x: 100, y: 0 }]); expect(cheminCourbe(pts)).toBe('M0.0 200.0 L100.0 0.0');
    expect(pointsCourbe([5], { x0: 0, x1: 100, y0: 200, y1: 0 }, 10)[0].x).toBe(50);
  });
  it('arc de jauge', () => { expect(arcJauge(100, 100, 50, 0)).toBe(''); expect(arcJauge(100, 100, 50, 1)).toBe('M50.0 100 A50 50 0 0 1 150.0 100.0'); });
});

describe('calculer', () => {
  const f = (periode = 0, produit: 'tous' | 'ecole' | 'auto' = 'tous') => ({ periode, produit });
  it('sans compte : population simulée seule', () => {
    const i = calculer(entreeVide(), BASE, f(), NOW);
    expect(i.membres).toEqual({ base: 18_420, local: 0, total: 18_420 });
    expect(i.encours.total).toBe(2_840_000_000); expect(i.retards.taux).toBe(1.8); expect(i.partenaires.total).toBe(312);
    expect(i.compteLocal).toBe(false); expect(i.partSalaire.total).toBe(11_960); expect(i.niveaux.total).toBe(18_420);
  });
  it('le compte local s\'ajoute (encours, membres, niveau, part de salaire)', () => {
    const i = calculer(aicha(), BASE, f(), NOW);
    expect(i.membres.total).toBe(18_421); expect(i.encours.local).toBe(352_000); expect(i.encours.total).toBe(2_840_352_000);
    expect(i.niveaux.lignes.find((l) => l.niveau === 'PRO')!.local).toBe(1);
    expect(i.partSalaire.classes[0].local).toBe(1); expect(i.partSalaire.total).toBe(11_961);
    expect(i.reports.paiesAvecReport).toBe(1);
  });
  it('filtre produit : encours et lignes d\'un seul produit', () => {
    const i = calculer(aicha(), BASE, f(0, 'auto'), NOW);
    expect(i.encours.lignes).toHaveLength(1); expect(i.encours.total).toBe(860_000_000); expect(i.encours.local).toBe(0);
    expect(i.partSalaire.total).toBe(Math.round(11_960 * (860 / 2840)));
    const e = calculer(aicha(), BASE, f(0, 'ecole'), NOW);
    expect(e.encours.total).toBe(1_120_000_000 + 352_000); expect(e.partSalaire.classes[0].local).toBe(1);
  });
  it('mois passé : base du mois, pas de stock local, mais la paie du mois', () => {
    const i = calculer(aicha(), BASE, f(1), NOW);
    expect(i.periode.cle).toBe('2026-09'); expect(i.encours.total).toBe(2_710_000_000); expect(i.stockLocal).toBe(false);
    expect(i.encours.local).toBe(0); expect(i.niveaux.total).toBe(17_980 + 0); expect(i.paie.local.at(-1)!.salaires).toBe(520_000);
    expect(i.paie.total).toHaveLength(6);
  });
  it('alerte au-dessus de 33 % pour un compte local trop chargé', () => {
    const e = aicha(); e.credits = [cr({ mensualite: 200_000 })];
    expect(calculer(e, BASE, f(), NOW).partSalaire.classes[4].local).toBe(1);
  });
  it('reports : un crédit « reporté » compte dans les retards', () => {
    const e = aicha(); e.credits = [cr({ statut: 'reporte' })];
    const i = calculer(e, BASE, f(), NOW);
    expect(i.retards.local).toEqual({ credits: 1, retards: 1 }); expect(i.retards.retards).toBe(216);
  });
  it('compte créé après la période : non compté', () => {
    const e = aicha(); e.compte!.cree = NOW;
    expect(calculer(e, BASE, f(2), NOW).membres.local).toBe(0);
  });
  it('base trop courte : pas d\'exception', () => {
    const court: BasePopulation = { ...BASE, paie: BASE.paie.slice(-2) };
    expect(() => calculer(entreeVide(), court, f(2), NOW)).not.toThrow();
  });
});

describe('export CSV', () => {
  it('étiquette la population simulée et neutralise les formules', () => {
    const i = calculer(aicha(), BASE, { periode: 0, produit: 'tous' }, NOW);
    const csv = csvPilotage(i);
    expect(csv.startsWith('﻿Rapport de pilotage AssureMe')).toBe(true);
    expect(csv).toContain('Population simulée'); expect(csv).toContain('Encours total;2840000000;352000;2840352000;FCFA');
    expect(csv).toContain('Alertes au-dessus de 33 %;');
    expect(csv).toContain('Tous les produits');
    i.encours.lignes[0].libelle = '=HYPERLINK("x")';
    expect(csvPilotage(i)).toContain("'=HYPERLINK");
  });
});
