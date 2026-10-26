import { describe, expect, it } from 'vitest';
import { DEPARTS, MARQUE, PAS_TOTAL, RESERVE, cellule, poseLigne, poseMarque } from './panneau.ts';

describe('panneau à palettes', () => {
  it('pose chaque cellule sur sa cible avant la fin de l’animation', () => {
    MARQUE.split('').forEach((c, i) => { expect(poseMarque(i)).toBeLessThan(PAS_TOTAL); expect(cellule(c, i, poseMarque(i), PAS_TOTAL)).toEqual({ ch: c, pose: true }); });
    DEPARTS.forEach((d, ri) => d.code.split('').forEach((_, j) => expect(poseLigne(ri, j)).toBeLessThan(PAS_TOTAL)));
  });
  it('affiche une lettre de la réserve avant la pose, de façon déterministe', () => {
    const a = cellule('C', 3, 10, 2); expect(a.pose).toBe(false); expect(RESERVE).toContain(a.ch); expect(cellule('C', 3, 10, 2)).toEqual(a);
  });
  it('lit les trois départs de la maquette', () => {
    expect(DEPARTS.map((d) => d.code)).toEqual(['CDG', 'PUJ', 'LIS']); expect(DEPARTS.map((d) => d.heure)).toEqual(['18:05', '19:30', '21:15']);
  });
});
