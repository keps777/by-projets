import { describe, expect, it } from 'vitest';
import { aire, ajuster, placerEtiquettes, arc3D, arcProjete, BORNES, chemin, CONTOUR, dalle, dansPolygone, distancePlan, hauteurArc, HAUTEUR, longueur, ombreArc, plan, projeter, projeterLL, seRecoupe, VILLES_CARTE, villeCarte, VUE_REPOS, type Vue } from './cameroun.ts';

const ll = (nom: string) => { const v = villeCarte(nom)!; return [v.lon, v.lat] as const; };
const vue: Vue = ajuster(VUE_REPOS, dalle().flatMap((p) => [{ ...p, z: 0 }, { ...p, z: HAUTEUR }]), 360, 330, 8);

describe('contour du Cameroun', () => {
  it('est un polygone simple, orienté dans le sens trigonométrique, dans les bornes du pays', () => {
    expect(CONTOUR.length).toBeGreaterThan(40);
    expect(seRecoupe(CONTOUR)).toBe(false);
    expect(aire(CONTOUR)).toBeGreaterThan(0);
    for (const [lon, lat] of CONTOUR) { expect(lon).toBeGreaterThanOrEqual(BORNES.lonMin); expect(lon).toBeLessThanOrEqual(BORNES.lonMax); expect(lat).toBeGreaterThanOrEqual(BORNES.latMin); expect(lat).toBeLessThanOrEqual(BORNES.latMax); }
    expect(Math.min(...CONTOUR.map((p) => p[0]))).toBeCloseTo(BORNES.lonMin, 1); expect(Math.max(...CONTOUR.map((p) => p[1]))).toBeCloseTo(BORNES.latMax, 1);
  });
  it('a la bonne superficie (≈ 475 000 km², soit ≈ 38 degrés² à cette latitude)', () => {
    const km2 = aire(CONTOUR) * 111.2 * 111.2 * Math.cos((7.4 * Math.PI) / 180);
    expect(km2).toBeGreaterThan(400_000); expect(km2).toBeLessThan(560_000);
  });
  it('contient toutes les villes phares', () => { for (const v of VILLES_CARTE) expect(dansPolygone([v.lon, v.lat], CONTOUR), v.nom).toBe(true); });
  it('laisse dehors la mer et les voisins', () => {
    expect(dansPolygone([8.0, 3.0], CONTOUR)).toBe(false); expect(dansPolygone([9.0, 3.5], CONTOUR)).toBe(false); // golfe de Guinée
    expect(dansPolygone([12.0, 1.5], CONTOUR)).toBe(false); // Gabon
    expect(dansPolygone([17.0, 8.0], CONTOUR)).toBe(false); // Tchad / Centrafrique
    expect(dansPolygone([11.0, 9.0], CONTOUR)).toBe(false); // Nigeria
  });
  it('place les villes les unes par rapport aux autres comme sur une vraie carte', () => {
    const x = (n: string) => plan(villeCarte(n)!.lon, villeCarte(n)!.lat);
    expect(x('Yaoundé').x).toBeGreaterThan(x('Douala').x); expect(x('Bamenda').y).toBeGreaterThan(x('Yaoundé').y); expect(x('Maroua').y).toBeGreaterThan(x('Garoua').y);
    expect(x('Kribi').y).toBeLessThan(x('Douala').y); expect(x('Garoua').y).toBeGreaterThan(x('Ngaoundéré').y); expect(x('Bertoua').x).toBeGreaterThan(x('Yaoundé').x);
  });
  it('a des noms de villes uniques et un côté d’étiquette valide', () => { expect(new Set(VILLES_CARTE.map((v) => v.nom)).size).toBe(VILLES_CARTE.length); for (const v of VILLES_CARTE) expect('gdhb').toContain(v.cote); });
});

describe('plan et projection', () => {
  it('centre le plan sur le pays : le milieu du pays est près de l’origine', () => { const p = plan((BORNES.lonMin + BORNES.lonMax) / 2, (BORNES.latMin + BORNES.latMax) / 2); expect(Math.abs(p.x)).toBeLessThan(0.5); expect(Math.abs(p.y)).toBeLessThan(0.5); });
  it('vu du dessus sans perspective : l’est est à droite, le nord en haut', () => {
    const v: Vue = { lacet: 0, inclinaison: 0, echelle: 10, cx: 100, cy: 100, distance: 1e9 };
    const o = projeter({ x: 0, y: 0, z: 0 }, v), e = projeter({ x: 1, y: 0, z: 0 }, v), n = projeter({ x: 0, y: 1, z: 0 }, v);
    expect(o).toMatchObject({ x: 100, y: 100 }); expect(e.x).toBeCloseTo(110); expect(e.y).toBeCloseTo(100); expect(n.y).toBeCloseTo(90); expect(n.x).toBeCloseTo(100);
  });
  it('incliné, le nord s’éloigne (plus petit, plus haut à l’écran) et le relief monte', () => {
    const v: Vue = { ...VUE_REPOS, echelle: 10, cx: 100, cy: 100 }, sud = projeter({ x: 0, y: -4, z: 0 }, v), nord = projeter({ x: 0, y: 4, z: 0 }, v);
    expect(nord.y).toBeLessThan(sud.y); expect(nord.k).toBeLessThan(sud.k);
    const sol = projeter({ x: 0, y: 0, z: 0 }, v), haut = projeter({ x: 0, y: 0, z: 1 }, v);
    expect(haut.y).toBeLessThan(sol.y);
  });
  it('à l’horizon (90°) la profondeur ne change plus la hauteur à l’écran', () => { const v: Vue = { ...VUE_REPOS, inclinaison: 90, echelle: 10, cx: 0, cy: 0 }; expect(projeter({ x: 0, y: 5, z: 0 }, v).y).toBeCloseTo(projeter({ x: 0, y: -5, z: 0 }, v).y, 5); });
  it('le lacet tourne la carte autour de la verticale', () => {
    const v: Vue = { lacet: 90, inclinaison: 0, echelle: 1, cx: 0, cy: 0, distance: 1e9 }, p = projeter({ x: 1, y: 0, z: 0 }, v);
    expect(p.x).toBeCloseTo(0, 5); expect(p.y).toBeCloseTo(-1, 5); // l’est passe vers le haut… et le nord devient l’ouest
    expect(projeter({ x: 0, y: 1, z: 0 }, v).x).toBeCloseTo(-1, 5);
  });
  it('ajuste la dalle dans la fenêtre demandée, au pixel près', () => {
    const pts = dalle().flatMap((p) => [projeter({ ...p, z: 0 }, vue), projeter({ ...p, z: HAUTEUR }, vue)]);
    expect(Math.min(...pts.map((p) => p.x))).toBeGreaterThanOrEqual(7.9); expect(Math.max(...pts.map((p) => p.x))).toBeLessThanOrEqual(352.1);
    expect(Math.min(...pts.map((p) => p.y))).toBeGreaterThanOrEqual(7.9); expect(Math.max(...pts.map((p) => p.y))).toBeLessThanOrEqual(322.1);
    expect(Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)) > 300 || Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)) > 290).toBe(true);
  });
  it('place les villes à l’écran dans l’ordre géographique, sans sortir de la vue', () => {
    const y = projeterLL(ll('Yaoundé'), HAUTEUR, vue), d = projeterLL(ll('Douala'), HAUTEUR, vue), m = projeterLL(ll('Maroua'), HAUTEUR, vue), k = projeterLL(ll('Kribi'), HAUTEUR, vue);
    expect(y.x).toBeGreaterThan(d.x); expect(m.y).toBeLessThan(y.y); expect(k.y).toBeGreaterThan(d.y);
    for (const v of VILLES_CARTE) { const p = projeterLL([v.lon, v.lat], HAUTEUR, vue); expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(360); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(330); }
  });
  it('écrit un chemin SVG fermé', () => { expect(chemin([{ x: 1, y: 2 }, { x: 3.04, y: 4 }, { x: 5, y: 6 }])).toBe('M1 2L3 4L5 6Z'); expect(chemin([{ x: 1, y: 2 }, { x: 3, y: 4 }], false)).toBe('M1 2L3 4'); });
});

describe('arc entre deux villes', () => {
  const a = ll('Yaoundé'), b = ll('Douala');
  it('part de la ville de départ, arrive à la ville d’arrivée, culmine au milieu', () => {
    const pts = arc3D(a, b, 40), p = plan(a[0], a[1]), q = plan(b[0], b[1]);
    expect(pts).toHaveLength(41);
    expect(pts[0]).toMatchObject({ x: p.x, y: p.y }); expect(pts[0].z).toBeCloseTo(HAUTEUR, 6);
    expect(pts[40].x).toBeCloseTo(q.x, 9); expect(pts[40].y).toBeCloseTo(q.y, 9); expect(pts[40].z).toBeCloseTo(HAUTEUR, 6);
    const hauts = pts.map((z) => z.z); expect(Math.max(...hauts)).toBe(hauts[20]); expect(hauts[20]).toBeCloseTo(HAUTEUR + hauteurArc(distancePlan(a, b)), 6);
  });
  it('est plus haut pour une longue liaison que pour une courte, dans des bornes raisonnables', () => {
    expect(hauteurArc(distancePlan(ll('Yaoundé'), ll('Maroua')))).toBeGreaterThan(hauteurArc(distancePlan(a, b)));
    expect(hauteurArc(0.01)).toBe(0.35); expect(hauteurArc(100)).toBe(2);
  });
  it('change quand on change de ville d’arrivée (Douala ≠ Bamenda) et reste dans la vue', () => {
    const vD = arcProjete(a, b, vue), vB = arcProjete(a, ll('Bamenda'), vue);
    expect(vD[40]).not.toEqual(vB[40]); expect(vD[0]).toEqual(vB[0]);
    for (const p of [...vD, ...vB]) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(360); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(330); }
    expect(vB[40].y).toBeLessThan(vB[0].y); // Bamenda est au nord de Yaoundé : plus haut à l’écran
  });
  it('a une ombre posée au sol, sous l’arc, qui rejoint les mêmes extrémités au niveau de la dalle', () => {
    const haut = arcProjete(a, b, vue), sol = ombreArc(a, b, vue);
    expect(sol[20].y).toBeGreaterThan(haut[20].y); expect(longueur(haut)).toBeGreaterThan(longueur(sol) * 0.9);
  });
  it('a une longueur à l’écran croissante avec la distance', () => { expect(longueur(arcProjete(a, ll('Maroua'), vue))).toBeGreaterThan(longueur(arcProjete(a, b, vue))); });
});

describe('étiquettes', () => {
  const e = (id: string, x: number, y: number, rang: number, pref: 'g' | 'd' | 'h' | 'b' = 'd', l = 50) => ({ id, x, y, l, h: 18, pref, rang });
  const cadre = { w: 360, h: 330 };
  it('met chaque étiquette du côté préféré quand la place est libre', () => { expect(placerEtiquettes([e('a', 100, 100, 0, 'g'), e('b', 250, 200, 1, 'h')], cadre)).toEqual({ a: 'g', b: 'h' }); });
  it('change de côté pour éviter l’étiquette voisine et le point voisin', () => {
    const r = placerEtiquettes([e('a', 100, 100, 0, 'd'), e('b', 130, 104, 1, 'd')], cadre);
    expect(r.a).toBe('g'); expect(r.b).toBe('d'); // a ne peut pas passer sur le point de b
  });
  it('ne laisse jamais deux étiquettes se recouvrir, et masque les moins importantes qui n’ont pas de place', () => {
    const items = [e('a', 100, 100, 0), e('b', 104, 106, 2), e('c', 98, 112, 2), e('d', 108, 94, 2), e('e', 96, 120, 2), e('f', 112, 118, 2)];
    const r = placerEtiquettes(items, cadre), vues = items.filter((i) => r[i.id]);
    expect(r.a).not.toBeNull(); expect(vues.length).toBeLessThan(items.length);
    for (const a of vues) for (const b of vues) if (a !== b) {
      const rect = (i: typeof a) => { const c = r[i.id]!, ec = 10; return c === 'd' ? [i.x + ec, i.y - 9, i.x + ec + i.l, i.y + 9] : c === 'g' ? [i.x - ec - i.l, i.y - 9, i.x - ec, i.y + 9] : c === 'h' ? [i.x - 25, i.y - ec - 18, i.x + 25, i.y - ec] : [i.x - 25, i.y + ec, i.x + 25, i.y + ec + 18]; };
      const [p, q] = [rect(a), rect(b)]; expect(p[0] >= q[2] || q[0] >= p[2] || p[1] >= q[3] || q[1] >= p[3], `${a.id}/${b.id}`).toBe(true);
    }
  });
  it('reste dans le cadre : une ville au bord reçoit l’étiquette du côté du cadre', () => { expect(placerEtiquettes([e('a', 340, 100, 0, 'd')], cadre).a).toBe('g'); expect(placerEtiquettes([e('a', 20, 100, 0, 'g')], cadre).a).toBe('d'); });
  it('les villes importantes gardent une étiquette même serrées', () => { const r = placerEtiquettes([e('a', 100, 100, 0), e('b', 102, 100, 1)], { w: 120, h: 120 }); expect(r.a).not.toBeNull(); expect(r.b).not.toBeNull(); });
});
