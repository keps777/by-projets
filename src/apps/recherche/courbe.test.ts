import { describe, expect, it } from 'vitest';
import { VOLS } from '../../data/seed.ts';
import { BAS, HAUT, LARGEUR, depuisMois, etiquettesAxe, lignesTable, pointsDeCourbe, resumeCourbe, variation } from './courbe.ts';

const v816 = VOLS.find((v) => v.id === 'v-ae816')!, AUJ = '2026-10-12';
const coords = (p: string) => p.split(' ').map((c) => c.split(',').map(Number));

describe('points du graphique', () => {
  it('un point par jour, de gauche à droite, le plus haut prix en haut', () => {
    const g = pointsDeCourbe(v816.courbe), pts = coords(g.points); expect(pts).toHaveLength(90); expect(pts[0][0]).toBe(2); expect(pts.at(-1)![0]).toBe(LARGEUR - 2);
    const ys = pts.map((p) => p[1]); expect(Math.min(...ys)).toBeGreaterThanOrEqual(HAUT); expect(Math.max(...ys)).toBeLessThanOrEqual(BAS);
    const iMax = v816.courbe.indexOf(Math.max(...v816.courbe)); expect(ys[iMax]).toBe(Math.min(...ys)); expect(g.fin.y).toBe(pts.at(-1)![1]); expect(g.yPrix).toBeNull();
  });
  it('le prix demandé reste dans le cadre, même sous la courbe', () => {
    const g = pointsDeCourbe(v816.courbe, 1500); expect(g.yPrix).toBe(BAS); expect(g.min).toBe(1500); expect(coords(g.points).every((p) => p[1] < BAS)).toBe(true);
    const h = pointsDeCourbe([100, 110, 120], 90); expect(h.yPrix).toBe(BAS); expect(pointsDeCourbe([100, 110, 120], 200).yPrix).toBe(HAUT);
  });
  it('la maquette : 1 050 $ → 2 050 $, prix demandé 1 500 $ à 52,2', () => {
    const g = pointsDeCourbe([1050, 2050], 1500); expect(g.yPrix).toBeCloseTo(52.2, 1); expect(coords(g.points)[0][1]).toBeCloseTo(89.8, 1); expect(coords(g.points)[1][1]).toBeCloseTo(6.2, 1);
  });
  it('courbe plate, vide ou à un point : pas de division par zéro', () => {
    expect(pointsDeCourbe([500, 500, 500]).points).toBe('2,89.8 156,89.8 310,89.8'); expect(pointsDeCourbe([]).points).toBe(''); expect(pointsDeCourbe([700]).points).toMatch(/^156,/);
  });
});
describe('variation et étiquettes', () => {
  it('signe toujours la variation', () => {
    expect(variation([1845, 2050])).toEqual({ abs: 205, sens: 'hausse', texte: '+205 $' }); expect(variation([2050, 1845])).toMatchObject({ sens: 'baisse', texte: '−205 $' }); expect(variation([900, 900])).toMatchObject({ sens: 'stable', texte: '0 $' }); expect(variation([]).texte).toBe('0 $');
  });
  it('la courbe du seed finit sur le prix neuf du vol', () => { expect(v816.courbe.at(-1)).toBe(v816.prixNeuf); expect(variation(v816.courbe).abs).toBe(v816.prixNeuf - v816.courbe[0]); });
  it('le graphique dit depuis quel mois il part (90 jours avant aujourd’hui)', () => {
    expect(depuisMois(90, AUJ)).toBe('juillet'); const e = etiquettesAxe(v816.courbe, AUJ); expect(e).toHaveLength(4); expect(e[0]).toBe(`juil. · ${v816.courbe[0].toLocaleString('fr-CA').replace(/\s/g, ' ')} $`); expect(e.at(-1)).toBe('auj.');
  });
  it('table alternative : une ligne toutes les deux semaines et le jour même', () => {
    const t = lignesTable(v816.courbe, AUJ); expect(t[0]).toEqual({ jour: '2026-07-15', prix: v816.courbe[0] }); expect(t.at(-1)).toEqual({ jour: AUJ, prix: v816.prixNeuf }); expect(t).toHaveLength(8); expect(lignesTable([], AUJ)).toEqual([]);
  });
  it('résumé pour lecteur d’écran', () => {
    const r = resumeCourbe([1845, 1900, 2050], 1500, AUJ); expect(r).toContain('de 1 845 $ à 2 050 $ aujourd’hui'); expect(r).toContain('+205 $'); expect(r).toContain('Prix demandé : 1 500 $'); expect(resumeCourbe([], undefined, AUJ)).toBe('Aucune donnée de prix.');
  });
});
