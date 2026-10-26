import { describe, expect, it } from 'vitest';
import { MAINTENANT_DEMO } from '../../data/constantes.ts';
import { monde } from '../../data/seed.ts';
import { ANNEAUX, aucunType, CENTRE, coteVoulu, dansLeBudget, destinationsRadar, direction, ecarter, evaluer, FILTRES_DEFAUT, lienResultats, messageVide, placerEtiquettes, positionPolaire, rayonPourDuree, sousTitre, TAILLE } from './radar.ts';

const NOW = Date.parse(MAINTENANT_DEMO);
describe('placement polaire', () => {
  it('les anneaux 3 · 6 · 9 · 12 h tombent sur leur rayon, le centre est Montréal', () => {
    for (const a of ANNEAUX) expect(rayonPourDuree(a.h)).toBe(a.rayon);
    expect(rayonPourDuree(0)).toBe(0); expect(rayonPourDuree(4.5)).toBe(75); expect(rayonPourDuree(7.5)).toBe(115);
    expect(rayonPourDuree(13)).toBeLessThan(ANNEAUX.at(-1)!.rayon); expect(rayonPourDuree(20)).toBe(rayonPourDuree(13));
  });
  it('0° est le nord, 90° l’est, 180° le sud, 270° l’ouest', () => {
    const n = positionPolaire(0, 6), e = positionPolaire(90, 6), s = positionPolaire(180, 6), o = positionPolaire(270, 6);
    expect(n.x).toBeCloseTo(CENTRE); expect(n.y).toBeCloseTo(CENTRE - 100); expect(e.x).toBeCloseTo(CENTRE + 100); expect(e.y).toBeCloseTo(CENTRE);
    expect(s.y).toBeCloseTo(CENTRE + 100); expect(o.x).toBeCloseTo(CENTRE - 100);
  });
  it('la direction se dit en toutes lettres', () => { expect(direction(0)).toBe('Nord'); expect(direction(72)).toBe('Est-nord-est'); expect(direction(168)).toBe('Sud-sud-est'); expect(direction(335)).toBe('Nord-nord-ouest'); expect(direction(360)).toBe('Nord'); });
  it('écarte les points trop proches sans en perdre ni les sortir du disque', () => {
    const serres = [{ x: 250, y: 140 }, { x: 252, y: 150 }, { x: 255, y: 145 }, { x: 175, y: 175 }];
    const p = ecarter(serres, 36);
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) expect(Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y)).toBeGreaterThan(30);
    for (const q of p) { const r = Math.hypot(q.x - CENTRE, q.y - CENTRE); expect(r).toBeLessThanOrEqual(ANNEAUX.at(-1)!.rayon); expect(r).toBeGreaterThanOrEqual(33); }
    expect(ecarter([{ x: 200, y: 100 }])).toEqual([{ x: 200, y: 100 }]);
  });
  it('côté préféré de l’étiquette', () => { expect(coteVoulu({ x: 250, y: 200 })).toBe('D'); expect(coteVoulu({ x: 100, y: 200 })).toBe('G'); expect(coteVoulu({ x: 180, y: 90 })).toBe('H'); });
  it('les étiquettes ne se recouvrent pas et restent dans la page, à 350 px comme à 280 px', () => {
    const pts = destinationsRadar(monde(), NOW).map((d) => ({ x: d.x, y: d.y }));
    for (const l of [350, 280]) {
      const c = placerEtiquettes(pts, l); expect(c).toHaveLength(10); expect(c.every((x) => ['D', 'G', 'H', 'B'].includes(x))).toBe(true);
      const k = l / TAILLE, r = pts.map((p, i) => ({ x: p.x * k, c: c[i] })); for (const q of r) { const x0 = q.c === 'D' ? q.x + 14 : q.c === 'G' ? q.x - 98 : q.x - 42, x1 = x0 + 84; expect(x0).toBeGreaterThanOrEqual(-20); expect(x1).toBeLessThanOrEqual(l + 20); }
    }
    expect(placerEtiquettes([{ x: 250, y: 200 }])).toEqual(['D']); expect(placerEtiquettes([{ x: 60, y: 200 }])).not.toEqual(['G']);
    expect(placerEtiquettes([{ x: 250, y: 200 }, { x: 255, y: 205 }])).not.toEqual(['D', 'D']);
  });
});

describe('destinations du radar', () => {
  const dests = destinationsRadar(monde(), NOW);
  it('dix destinations, sans Montréal ni Los Angeles, toutes dans le carré', () => {
    expect(dests).toHaveLength(10); expect(dests.map((d) => d.code)).not.toContain('YUL'); expect(dests.map((d) => d.code)).not.toContain('LAX');
    for (const d of dests) { expect(d.x).toBeGreaterThan(0); expect(d.x).toBeLessThan(TAILLE); expect(d.y).toBeGreaterThan(0); expect(d.y).toBeLessThan(TAILLE); }
    for (let i = 0; i < dests.length; i++) for (let j = i + 1; j < dests.length; j++) expect(Math.hypot(dests[i].x - dests[j].x, dests[i].y - dests[j].y)).toBeGreaterThan(25);
  });
  it('chaque destination porte ses offres du monde : neuf, revente, drop', () => {
    const puj = dests.find((d) => d.code === 'PUJ')!;
    expect(puj.offres.some((o) => o.type === 'drop' && o.prix === 200)).toBe(true); expect(puj.offres.some((o) => o.type === 'revente' && o.prix === 510)).toBe(true); expect(puj.offres.some((o) => o.type === 'neuf')).toBe(true);
    expect(dests.find((d) => d.code === 'KEF')!.offres.some((o) => o.etiquette === 'Agence')).toBe(true);
  });
  it('ses propres annonces ne sont pas proposées à l’achat', () => {
    const hav = (c?: string) => destinationsRadar(monde(), NOW, c).find((d) => d.code === 'HAV')!.offres.filter((o) => o.type === 'revente').map((o) => o.prix);
    expect(hav()).toContain(620); expect(hav('ACC-0412')).not.toContain(620);
  });
  it('un vol dont l’échéance est passée n’est plus proposé', () => {
    const tard = Date.parse('2026-10-17T00:00'); const cdg = destinationsRadar(monde(), tard).find((d) => d.code === 'CDG')!;
    expect(cdg.offres.some((o) => o.volId === 'v-ae830')).toBe(false); expect(cdg.offres.some((o) => o.volId === 'v-ae812')).toBe(true);
  });
});

describe('filtres de budget et de types', () => {
  const dests = destinationsRadar(monde(), NOW), de = (code: string) => dests.find((d) => d.code === code)!;
  it('meilleure offre : la moins chère parmi les types retenus', () => {
    expect(evaluer(de('PUJ'), FILTRES_DEFAUT).meilleure).toMatchObject({ type: 'revente', prix: 510 });
    expect(evaluer(de('PUJ'), { ...FILTRES_DEFAUT, drop: true }).meilleure).toMatchObject({ type: 'drop', prix: 200 });
    expect(evaluer(de('PUJ'), { ...FILTRES_DEFAUT, revente: false }).meilleure).toMatchObject({ type: 'neuf', prix: 690 });
  });
  it('le budget sépare dedans et dehors ; sans type, aucune offre', () => {
    expect(evaluer(de('NRT'), FILTRES_DEFAUT).dans).toBe(false); expect(evaluer(de('NRT'), { ...FILTRES_DEFAUT, budget: 2500 }).dans).toBe(true);
    const aucun = evaluer(de('PUJ'), { ...FILTRES_DEFAUT, neuf: false, revente: false }); expect(aucun.meilleure).toBeNull(); expect(aucun.dans).toBe(false); expect(aucun.prixTexte).toBe('aucune offre'); expect(aucun.taille).toBe(10);
  });
  it('le point grossit avec l’aubaine (12 à 26 px)', () => {
    const neuf = evaluer(de('PUJ'), { ...FILTRES_DEFAUT, revente: false }), drop = evaluer(de('PUJ'), { ...FILTRES_DEFAUT, drop: true });
    expect(neuf.taille).toBe(12); expect(drop.taille).toBe(26); expect(drop.estDrop).toBe(true); expect(drop.prixTexte).toBe('dès 200 $');
  });
  it('la liste accessible : sous le budget, du moins cher au plus cher', () => {
    const l = dansLeBudget(dests.map((d) => evaluer(d, FILTRES_DEFAUT))); expect(l.length).toBeGreaterThan(3);
    const prix = l.map((e) => e.meilleure!.prix); expect(prix).toEqual([...prix].sort((a, b) => a - b)); expect(prix.every((p) => p <= 1200)).toBe(true);
    expect(sousTitre(l[0])).toMatch(/^\d+ h( \d{2})? · (Revente|Neuf|Agence)$/);
    expect(dansLeBudget(dests.map((d) => evaluer(d, { ...FILTRES_DEFAUT, budget: 200 })))).toHaveLength(0);
  });
  it('messages et lien vers les résultats', () => {
    expect(aucunType({ ...FILTRES_DEFAUT, neuf: false, revente: false })).toBe(true); expect(messageVide({ ...FILTRES_DEFAUT, neuf: false, revente: false })).toContain('Aucun type d’offre');
    expect(messageVide({ ...FILTRES_DEFAUT, budget: 300 })).toBe('Aucune destination sous 300 $ avec ces filtres. Augmentez le budget max ou ajoutez la revente.');
    expect(lienResultats(evaluer(de('PUJ'), FILTRES_DEFAUT))).toBe('/resultats?de=YUL&vers=PUJ&jour=2026-10-16');
  });
});
