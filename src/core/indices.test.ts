import { describe, expect, it } from 'vitest';
import { etatInitial } from '../data/seed.ts';
import { extremes, indicesParZone, niveauChaleur, pointsSerie, routesDepuis, serieIndice, variation, variations } from './indices.ts';

const NOW = Date.parse('2026-10-12T09:00');
const monde = () => etatInitial().monde;
describe('variation', () => {
  it('compare le dernier point à celui d’il y a n jours, borné au premier', () => {
    const s = [100, 100, 100, 100, 110, 121]; expect(variation(s, 1)).toBe(10); expect(variation(s, 2)).toBe(21); expect(variation(s, 99)).toBe(21);
    expect(variation([100], 7)).toBe(0); expect(variations(s)).toEqual({ 7: 21, 30: 21, 90: 21 });
  });
});
describe('serieIndice', () => {
  it('base 100 au premier point, moyenne des rapports, alignée sur la fin', () => {
    expect(serieIndice([[100, 110], [200, 200]])).toEqual([100, 105]);
    expect(serieIndice([[999, 100, 120, 130], [50, 50, 60]])).toEqual([100, 110, 125]); // la plus courte fixe la fenêtre
    expect(serieIndice([])).toEqual([]);
  });
  it('ignore une courbe trop courte', () => { expect(serieIndice([[100, 120], [5]])).toEqual([100, 120]); });
});
describe('routesDepuis', () => {
  const r = routesDepuis(monde(), NOW);
  it('une route par destination au départ de YUL, avec le prochain vol ouvert pour référence', () => {
    expect(r.map((x) => x.code)).toEqual(['BOG', 'CDG', 'FCO', 'HAV', 'KEF', 'LIS', 'MEX', 'NRT', 'PPT', 'PUJ']);
    const cdg = r.find((x) => x.code === 'CDG')!; expect(cdg.zone).toBe('Europe'); expect(cdg.volId).toBe('v-ae830'); expect(cdg.prix).toBe(1210); expect(cdg.nbVols).toBeGreaterThan(3);
  });
  it('variations calculées depuis les courbes (aucune valeur figée)', () => {
    const m = monde(), x = r.find((q) => q.code === 'PPT')!; const vols = m.vols.filter((v) => v.vers === 'PPT');
    const attendu = serieIndice(vols.map((v) => v.courbe)); expect(x.variation[30]).toBe(variation(attendu, 30)); expect(x.variation[90]).toBe(variation(attendu, 90));
    m.vols.forEach((v) => { v.courbe = v.courbe.map(() => v.prixNeuf); }); expect(routesDepuis(m, NOW).every((q) => q.variation[7] === 0 && q.variation24h === 0)).toBe(true);
  });
  it('sans vol ouvert, la référence est le plus récent', () => { expect(routesDepuis(monde(), Date.parse('2030-01-01T00:00')).find((q) => q.code === 'CDG')!.volId).toBe('v-ae822'); });
});
describe('indicesParZone', () => {
  const z = indicesParZone(monde(), NOW);
  it('une carte par zone servie, dans l’ordre, avec indice et écart à la base', () => {
    expect(z.map((c) => c.zone)).toEqual(['Caraïbes', 'Europe', 'Amériques', 'Asie', 'Océanie']);
    for (const c of z) { expect(c.serie[0]).toBe(100); expect(c.valeur).toBe(c.serie.at(-1)); expect(c.depuisBase).toBeCloseTo(c.valeur - 100, 1); expect(c.variation[90]).toBeCloseTo(c.depuisBase, 0); expect(c.routes.length).toBeGreaterThan(0); }
    expect(z[0]).toMatchObject({ nom: 'NexG Caraïbes', sigle: 'CAR' }); expect(z[0].routes.map((r) => r.code)).toEqual(['HAV', 'PUJ']);
  });
  it('« Amériques » ne contient pas Montréal', () => { expect(z.find((c) => c.zone === 'Amériques')!.routes.map((r) => r.code)).toEqual(['BOG', 'MEX']); });
});
describe('extremes et chaleur', () => {
  it('plus forte hausse et plus forte baisse ; aucune si tout monte', () => {
    const r = routesDepuis(monde(), NOW), e = extremes(r, 30);
    expect(e.hausse!.variation[30]).toBe(Math.max(...r.map((x) => x.variation[30]))); expect(e.baisse).toBeUndefined();
    const m = monde(); const v = m.vols.find((x) => x.vers === 'HAV')!; v.courbe = v.courbe.map((_, i) => 1000 - i * 5); m.vols.filter((x) => x.vers === 'HAV').forEach((x) => (x.courbe = v.courbe));
    expect(extremes(routesDepuis(m, NOW), 90).baisse!.code).toBe('HAV');
  });
  it('niveaux de chaleur signés', () => { expect([0, 2.9, 3, 7.9, 8, 14.9, 15, 40].map(niveauChaleur)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]); expect(niveauChaleur(-20)).toBe(-3); expect(niveauChaleur(-5)).toBe(-1); });
});
describe('pointsSerie', () => {
  it('place la valeur haute en haut et termine sur le dernier point', () => { const p = pointsSerie([1, 2, 3], 100, 50, 5)!; expect(p.fin).toEqual({ x: 95, y: 5 }); expect(p.debutY).toBe(45); expect(p.points).toBe('5,45 50,25 95,5'); expect(pointsSerie([3, 3], 100, 50)!.fin.y).toBe(25); expect(pointsSerie([1])).toBeNull(); });
});
