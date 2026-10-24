import { describe, expect, it } from 'vitest';
import { agreger, comparer, concurrence, hash01, margeBus, parBus, parGare, parLigne, periode, remplissageHeure, serieJours, simulerPrix, tendance, topLignes, ventes, type BilletA, type DepartA, type LigneA } from './analyses.ts';

const AUJ = '2026-11-03';
const lignes: LigneA[] = [
  { id: 'l1', de: 'Yaoundé', vers: 'Douala', gareDe: 'mvan', compagnieId: 'BX', classe: 'Classique', prix: 6000, dureeMin: 210, horaires: ['07:00', '09:00'] },
  { id: 'l2', de: 'Yaoundé', vers: 'Bafoussam', gareDe: 'mvan', compagnieId: 'BX', classe: 'Classique', prix: 5000, dureeMin: 240, horaires: ['07:30'] },
  { id: 'l3', de: 'Yaoundé', vers: 'Douala', gareDe: 'nsam', compagnieId: 'AV', classe: 'Classique', prix: 4500, dureeMin: 190, horaires: ['06:00'] }
];
const dep = (id: string, ligneId: string, jour: string, heure: string, pris: number, extra: Partial<DepartA> = {}): DepartA => ({ id, ligneId, jour, heure, busId: 'bus1', capacite: 50, prix: 6000, statut: 'prevu', retardMin: 0, prisAilleurs: pris, ...extra });
const departs: DepartA[] = [dep('a', 'l1', AUJ, '07:00', 25, { statut: 'parti' }), dep('b', 'l1', '2026-11-04', '07:00', 30), dep('c', 'l1', '2026-11-04', '09:00', 40), dep('d', 'l2', AUJ, '07:30', 10, { prix: 5000 }), dep('e', 'l1', '2026-11-02', '07:00', 0, { statut: 'arrive' })];
const billets: BilletA[] = [{ departId: 'a', prix: 6000, statut: 'valide' }, { departId: 'a', prix: 6000, statut: 'expire' }, { departId: 'a', prix: 6000, statut: 'scanne' }];

describe('ventes', () => {
  it('compte les billets réels et les sièges déjà pris, sans dépasser la capacité', () => {
    const v = ventes({ lignes, departs, billets, aujourdhui: AUJ, debut: AUJ, fin: AUJ }), a = v.find((x) => x.departId === 'a')!;
    expect(a.reels).toBe(2); expect(a.billets).toBe(27); expect(a.recette).toBe(2 * 6000 + 25 * 6000); expect(a.source).toBe('mixte');
    expect(v.find((x) => x.departId === 'd')!.source).toBe('demo');
  });
  it('n’analyse pas l’avenir', () => { expect(ventes({ lignes, departs, billets, aujourdhui: AUJ, debut: '2026-11-04', fin: '2026-11-10' })).toEqual([]); });
  it('reconstitue les jours passés (départs virtuels) de façon déterministe, marqués démo', () => {
    const p = { lignes, departs, billets, aujourdhui: AUJ, debut: '2026-10-27', fin: AUJ };
    const v1 = ventes(p), v2 = ventes(p), passes = v1.filter((x) => x.jour < AUJ);
    expect(v1).toEqual(v2); expect(passes.length).toBeGreaterThan(20); expect(passes.every((x) => x.source === 'demo')).toBe(true);
    expect(passes.filter((x) => x.virtuel).length).toBeGreaterThan(0); expect(passes.every((x) => x.billets <= x.capacite)).toBe(true);
    const ref = passes.find((x) => x.ligneId === 'l1' && x.heure === '07:00')!; expect(ref.taux).toBeGreaterThan(0.2);
  });
  it('un départ annulé ne rapporte rien', () => {
    const v = ventes({ lignes, departs: [dep('x', 'l1', AUJ, '07:00', 30, { statut: 'annule' })], billets: [{ departId: 'x', prix: 6000, statut: 'valide' }], aujourdhui: AUJ, debut: AUJ, fin: AUJ });
    expect(v[0].recette).toBe(0); expect(agreger(v).annules).toBe(1); expect(agreger(v).departs).toBe(0);
  });
});
describe('agrégats', () => {
  const v = ventes({ lignes, departs, billets, aujourdhui: AUJ, debut: '2026-10-28', fin: AUJ });
  it('somme recette, billets, remplissage et ponctualité', () => {
    const a = agreger(v); expect(a.recette).toBe(v.reduce((s, x) => s + x.recette, 0)); expect(a.taux).toBeCloseTo(a.billets / a.capacite, 6);
    expect(a.auHeure).toBeLessThanOrEqual(1); expect(a.auHeure).toBeGreaterThan(0.7);
  });
  it('par ligne, gare et bus, triés par recette', () => {
    const l = parLigne(v); expect(l.length).toBe(3); expect(l[0].recette).toBeGreaterThanOrEqual(l[1].recette); expect(topLignes(l, 1)).toHaveLength(1);
    expect(parGare(v).map((g) => g.cle)).toContain('mvan'); expect(parBus(v)[0].cle).toBe('bus1');
  });
  it('série quotidienne complète sur 7 jours', () => { const s = serieJours(v, '2026-10-28', 7); expect(s).toHaveLength(7); expect(s[6].jour).toBe(AUJ); expect(s.reduce((x, p) => x + p.recette, 0)).toBe(agreger(v).recette); });
});
describe('périodes, comparaisons, tendance', () => {
  it('jour compare au même jour de la semaine passée', () => { const p = periode('jour', AUJ); expect(p.precDebut).toBe('2026-10-27'); expect(p.comparaison).toBe('vs mar. dernier'); });
  it('semaine : 7 jours se terminant aujourd’hui, comparés aux 7 d’avant', () => { const p = periode('semaine', AUJ); expect([p.debut, p.fin, p.precDebut, p.precFin]).toEqual(['2026-10-28', AUJ, '2026-10-21', '2026-10-27']); });
  it('mois : 30 jours', () => { const p = periode('mois', AUJ); expect(p.nb).toBe(30); expect(p.precFin).toBe('2026-10-04'); });
  it('comparer renvoie hausse, baisse ou stable', () => {
    expect(comparer(111, 100)).toMatchObject({ pct: 11, sens: 'hausse' }); expect(comparer(94, 100)).toMatchObject({ pct: -6, sens: 'baisse' }); expect(comparer(5, 0)).toMatchObject({ pct: null, sens: 'stable' });
  });
  it('tendance : pente, variation et jours de baisse consécutifs', () => {
    expect(tendance([100, 110, 120, 130]).sens).toBe('hausse'); expect(tendance([100, 100, 100]).sens).toBe('stable');
    const t = tendance([200, 180, 150, 120, 100]); expect(t.sens).toBe('baisse'); expect(t.joursDeBaisse).toBe(4); expect(t.pct).toBeLessThan(-40);
  });
});
describe('carte de chaleur, simulateur, concurrence', () => {
  it('7 × 12 cases, null sans départ', () => {
    const m = remplissageHeure(ventes({ lignes, departs, billets, aujourdhui: AUJ, debut: '2026-10-28', fin: AUJ }).filter((x) => x.ligneId === 'l2'));
    expect(m).toHaveLength(7); expect(m[0]).toHaveLength(12); const pleines = m.flat().filter((x) => x !== null); expect(pleines.length).toBe(7); expect(pleines.every((x) => x! > 0 && x! <= 1)).toBe(true);
  });
  it('baisser le prix de 500 F gagne 12 points, bornés à 20–98 %', () => {
    const b = { prix: 5000, taux: 0.61, capacite: 40 };
    expect(simulerPrix(b, 4500).taux).toBeCloseTo(0.73, 6); expect(simulerPrix(b, 5000).recetteBus).toBe(Math.round(40 * 0.61) * 5000); expect(simulerPrix(b, 3000).taux).toBe(0.98); expect(simulerPrix(b, 9000).taux).toBe(0.2);
  });
  it('marge par bus = recette − coût de route estimé', () => { expect(margeBus(200_000, 240)).toBe(200_000 - 300 * 240); });
  it('concurrence : prix le plus bas d’une autre compagnie sur la même liaison', () => {
    expect(concurrence(lignes, lignes[0])).toEqual({ prix: 4500, compagnieId: 'AV', heure: '06:00' }); expect(concurrence(lignes, lignes[1])).toBeNull();
  });
  it('hash01 est stable et dans [0,1[', () => { expect(hash01('x')).toBe(hash01('x')); expect(hash01('x')).toBeLessThan(1); expect(hash01('x')).not.toBe(hash01('y')); });
});
