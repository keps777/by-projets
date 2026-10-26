import { describe, expect, it } from 'vitest';
import { MAINTENANT_DEMO } from '../../data/constantes.ts';
import { monde } from '../../data/seed.ts';
import { bagageInutilise, dropEnDirect, intentionAffichee, nbIntentions, prochainVoyage, soute } from './accueil.ts';
import { agregatPortefeuille, droitsActifs, pointsLigne, prochaineEcheance, serieValeur } from './portefeuille.ts';
import { tendances, variation30j } from './tendances.ts';

const NOW = Date.parse(MAINTENANT_DEMO), ALEX = 'ACC-0412';
describe('portefeuille d’Alex', () => {
  it('trois droits actifs : prix équivalent 4 730 $, payé 3 050 $, écart +1 680 $', () => {
    const a = agregatPortefeuille(monde(), ALEX, NOW);
    expect(a).toMatchObject({ nb: 3, equivalent: 4730, paye: 3050 }); expect(a.ecart.abs).toBe(1680); expect(a.ecart.sens).toBe('hausse');
    expect(droitsActifs(monde(), ALEX, NOW).map((x) => x.droit.id)).toEqual(['d-812', 'd-puj', 'd-ppt']); // d-hav est en vente : hors total
  });
  it('un compte sans droit : agrégat vide, pas de série', () => {
    const a = agregatPortefeuille(monde(), 'ACC-0233', NOW); expect(a.nb).toBe(0); expect(a.equivalent).toBe(0); expect(serieValeur(monde(), 'ACC-9999', NOW)).toEqual([]);
  });
  it('un vol parti n’est plus actif', () => { expect(droitsActifs(monde(), ALEX, Date.parse('2026-12-15T00:00')).map((x) => x.droit.id)).toEqual(['d-puj', 'd-ppt']); });
  it('la série finit au prix équivalent d’aujourd’hui', () => {
    const s = serieValeur(monde(), ALEX, NOW); expect(s).toHaveLength(9); expect(s.at(-1)).toBe(4730);
    const p = pointsLigne(s)!; expect(p.points.split(' ')).toHaveLength(9); expect(p.dernier.x).toBe(110);
    expect(pointsLigne([5, 5, 5])!.dernier.y).toBe(24); expect(pointsLigne([1])).toBeNull();
    const m = pointsLigne([1, 2, 3])!; expect(m.points).toBe('2,42 56,24 110,6');
  });
  it('prochaine échéance : nommer le voyageur avant le 13 déc. 18:05', () => {
    const e = prochaineEcheance(monde(), ALEX, NOW)!; expect(e.droitId).toBe('d-812'); expect(e.echeanceMs).toBe(Date.parse('2026-12-13T18:05'));
    expect(prochaineEcheance(monde(), ALEX, Date.parse('2026-12-13T19:00'))!.droitId).toBe('d-puj');
  });
});
describe('accueil du compte', () => {
  it('prochain voyage : YUL → CDG, 14 déc., Aérolys 812, direct 7 h 05', () => {
    const p = prochainVoyage(monde(), ALEX, NOW)!; expect(p.droit.id).toBe('d-812'); expect(p).toMatchObject({ deVille: 'Montréal', versVille: 'Paris', numeroAffiche: 'Aérolys 812', trajet: 'direct 7 h 05' });
    expect(prochainVoyage(monde(), 'ACC-0301', NOW)).toBeUndefined();
  });
  it('bagage inutilisé, intention et soute', () => {
    expect(bagageInutilise(monde(), ALEX, 'v-ae812')?.id).toBe('b-alex'); expect(bagageInutilise(monde(), ALEX, 'v-no905')).toBeUndefined();
    const i = intentionAffichee(monde(), ALEX)!; expect(i.intention.id).toBe('INT-4F7K'); expect(i.intention.budget).toBe(1300); expect(i.recues).toBe(3); expect(i.fondsReserves).toBe(true);
    expect(nbIntentions(monde(), ALEX)).toEqual({ nb: 2, fondsReserves: true }); expect(soute(monde(), 'v-ae812')).toEqual({ nb: 7, des: 90 }); expect(soute(monde(), 'v-no905')).toBeUndefined();
  });
  it('drop en direct tant que le compte à rebours court', () => {
    expect(dropEnDirect(monde(), NOW)?.n).toBe(128); expect(dropEnDirect(monde(), NOW + 5 * 60_000)).toBeUndefined();
    const m = monde(); m.drops[0].restantes = 0; expect(dropEnDirect(m, NOW)).toBeUndefined();
  });
});
describe('tendances', () => {
  it('variation sur 30 jours d’une courbe', () => { const c = Array.from({ length: 90 }, (_, i) => 100 + i); expect(variation30j(c)).toBeCloseTo(((189 - 159) / 159) * 100, 0); expect(variation30j([100])).toBe(0); });
  it('une tendance par destination, de la plus forte hausse à la plus forte baisse', () => {
    const t = tendances(monde(), NOW); expect(t).toHaveLength(10); const v = t.map((x) => x.variationPct); expect(v).toEqual([...v].sort((a, b) => b - a));
    expect(t.find((x) => x.code === 'CDG')!.volId).toBe('v-ae830'); expect(t.find((x) => x.code === 'PPT')!.sous).toBe('Via LAX · 14 h 30');
  });
});
