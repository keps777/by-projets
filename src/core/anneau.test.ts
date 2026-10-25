import { describe, expect, it } from 'vitest';
import { adoucir, aimanter, angleRelatif, cibleInertie, courbe, dureeRecalage, filtreCarte, GEOMETRIE, normaliser, poseTranche, rotationCarte, transformCarte } from './anneau.ts';
import { trancheDevant } from './recherche.ts';

describe('angles', () => {
  it('normalise dans ]−180, 180]', () => {
    expect([0, 180, -180, 190, -190, 360, 725, -45].map(normaliser)).toEqual([0, 180, 180, -170, 170, 0, 5, -45]);
  });
  it('angle relatif : la tranche de face est à 0, les voisines à ±45', () => {
    expect(angleRelatif(2, -90)).toBe(0);
    expect(angleRelatif(3, -90)).toBe(45);
    expect(angleRelatif(1, -90)).toBe(-45);
    expect(angleRelatif(6, -90)).toBe(180);
    expect(angleRelatif(7, -90)).toBe(-135);
  });
  it('la tranche de face est celle d’angle 0 (accord avec trancheDevant)', () => {
    for (const rot of [0, -45, -90, -135, -180, -315, -360, 45, 90]) {
      const faces = Array.from({ length: 8 }, (_, i) => i).filter((i) => angleRelatif(i, rot) === 0);
      expect(faces).toEqual([trancheDevant(rot)]);
    }
  });
});
describe('courbe', () => {
  it('interpole et borne', () => {
    const t = [[0, 0], [10, 100]] as const;
    expect([courbe(t, -5), courbe(t, 0), courbe(t, 2.5), courbe(t, 10), courbe(t, 99)]).toEqual([0, 0, 25, 100, 100]);
  });
});
describe('pose d’une tranche', () => {
  const face = poseTranche(0), droite = poseTranche(45), gauche = poseTranche(-45), fond = poseTranche(180);
  it('la face est droite, devant, nette et pleinement visible', () => {
    expect(face).toMatchObject({ angle: 0, x: 0, y: 0, rotation: 0, envers: false, echelle: 1, opacite: 1, luminosite: 1, flou: 0, profondeur: 0, interactive: true });
    expect(face.z).toBe(GEOMETRIE.avance);
    expect(filtreCarte(face)).toBe('none');
    expect(transformCarte(face)).toBe(`translate3d(0px, 0px, ${GEOMETRIE.avance}px) rotateY(0deg) scale(1)`);
  });
  it('les voisines sont fortement tournées, reculées, plus petites, assombries et floutées, symétriques', () => {
    expect(droite.rotation).toBeGreaterThan(55);
    expect(droite.z).toBeLessThan(-80);
    expect(droite.x).toBeGreaterThan(180);
    expect(droite.echelle).toBeLessThan(face.echelle);
    expect(droite.luminosite).toBeLessThan(face.luminosite);
    expect(droite.flou).toBeGreaterThan(0);
    expect(droite.interactive).toBe(true);
    expect(gauche.x).toBeCloseTo(-droite.x, 6);
    expect(gauche.rotation).toBeCloseTo(-droite.rotation, 6);
    expect(gauche.z).toBeCloseTo(droite.z, 6);
  });
  it('la voisine passe derrière le plan de la tranche de face, y compris son bord intérieur', () => {
    // bord intérieur d'une carte de largeur L tournée de r° : z + (L/2)·sin r ; il doit rester derrière la face
    const L = 238, r = (droite.rotation * Math.PI) / 180;
    expect(droite.z + (L / 2) * Math.sin(r)).toBeLessThan(face.z);
  });
  it('au repos et à mi-glissement, les cartes ne se croisent pas (largeur de carte 238 px)', () => {
    const L = 238;
    // au repos : le bord intérieur de la voisine ne recouvre pas la tranche de face
    const v = poseTranche(45);
    expect(v.x - (L / 2) * Math.cos((v.rotation * Math.PI) / 180)).toBeGreaterThanOrEqual(L / 2);
    // à mi-glissement (±22,5°) : les deux cartes qui se croisent au centre ne se recouvrent presque pas
    const a = poseTranche(22.5), b = poseTranche(-22.5);
    expect(a.x - (L / 2) * Math.cos((a.rotation * Math.PI) / 180)).toBeGreaterThanOrEqual(b.x + (L / 2) * Math.cos((b.rotation * Math.PI) / 180) - 4); // à 4 px près
  });
  it('profondeur, opacité, luminosité et échelle décroissent de la face au fond', () => {
    const poses = [0, 45, 90, 135, 180].map((a) => poseTranche(a));
    for (let i = 1; i < poses.length; i++) {
      expect(poses[i].profondeur).toBeGreaterThan(poses[i - 1].profondeur);
      expect(poses[i].opacite).toBeLessThan(poses[i - 1].opacite);
      expect(poses[i].luminosite).toBeLessThan(poses[i - 1].luminosite);
      expect(poses[i].echelle).toBeLessThan(poses[i - 1].echelle);
      expect(poses[i].flou).toBeGreaterThan(poses[i - 1].flou);
      expect(poses[i].z).toBeLessThan(poses[i - 1].z);
    }
    expect(fond.profondeur).toBeCloseTo(1, 6);
    expect(fond.y).toBeLessThan(0);
    expect(fond.opacite).toBeGreaterThan(0);
  });
  it('les cartes vues de dos sont retournées et ne reçoivent pas les clics', () => {
    expect(poseTranche(60).envers).toBe(false);
    expect(poseTranche(90).envers).toBe(true);
    expect(poseTranche(-135).envers).toBe(true);
    expect(transformCarte(poseTranche(135))).toContain('rotateY(180deg)');
    expect(poseTranche(90).interactive).toBe(false);
    expect(poseTranche(135).interactive).toBe(false);
    expect(poseTranche(54).interactive).toBe(true);
  });
  it('la rotation est continue et rejoint 180° au fond', () => {
    expect(rotationCarte(90, 1.3)).toBeCloseTo(117, 6);
    expect(rotationCarte(180, 1.3)).toBeCloseTo(180, 6);
    expect(rotationCarte(-180, 1.3)).toBeCloseTo(-180, 6);
    let prec = 0;
    for (let a = 0; a <= 180; a += 5) { const r = rotationCarte(a, 1.3); expect(r).toBeGreaterThanOrEqual(prec); prec = r; }
  });
  it('un angle hors plage est ramené (365° = 5°)', () => { expect(poseTranche(365).angle).toBe(5); });
  it('le filtre CSS combine luminosité et flou', () => { expect(filtreCarte(droite)).toMatch(/^brightness\(0\.8\) blur\(1px\)$/); });
});
describe('aimantation et inertie', () => {
  it('aimante sur la tranche la plus proche', () => {
    expect([0, 10, 22, 23, 67, -22, -23, -100].map((r) => aimanter(r))).toEqual([0, 0, 0, 45, 45, -0, -45, -90]);
  });
  it('geste instantané : pas d’élan, simple aimantation', () => { expect(cibleInertie(-45, 5, 20)).toBe(-45); expect(cibleInertie(-30, 5, 20)).toBe(-45); });
  it('geste lent ou arrêté : on reste sur la tranche la plus proche', () => { expect(cibleInertie(-50, 0, 400)).toBe(-45); });
  it('un lancer pousse dans son sens, au plus ±100°', () => {
    expect(cibleInertie(0, 0.3, 200)).toBe(45);
    expect(cibleInertie(0, -0.3, 200)).toBe(-45);
    expect(cibleInertie(0, 100, 200)).toBe(90);
    expect(cibleInertie(0, -100, 200)).toBe(-90);
    expect(cibleInertie(0, Number.NaN, 200)).toBe(0);
  });
  it('adoucir va de 0 à 1 avec un léger dépassement', () => {
    expect(adoucir(0)).toBeCloseTo(0, 6); expect(adoucir(1)).toBeCloseTo(1, 6); expect(adoucir(2)).toBeCloseTo(1, 6);
    const maxi = Math.max(...Array.from({ length: 101 }, (_, i) => adoucir(i / 100)));
    expect(maxi).toBeGreaterThan(1); expect(maxi).toBeLessThan(1.1);
  });
  it('la durée de recalage croît avec la distance et reste bornée', () => {
    expect(dureeRecalage(0)).toBe(360); expect(dureeRecalage(45)).toBeGreaterThan(dureeRecalage(10)); expect(dureeRecalage(10_000)).toBe(900);
  });
});
