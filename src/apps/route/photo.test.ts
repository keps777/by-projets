import { describe, expect, it } from 'vitest';
import { tailleMiniature } from './photo.ts';

describe('miniature des photos du profil', () => {
  it('réduit la plus grande dimension à 220 px en gardant les proportions, sans jamais agrandir', () => {
    expect(tailleMiniature(2200, 1100)).toEqual({ l: 220, h: 110 }); expect(tailleMiniature(900, 1800)).toEqual({ l: 110, h: 220 });
    expect(tailleMiniature(100, 50)).toEqual({ l: 100, h: 50 }); expect(tailleMiniature(0, 0)).toEqual({ l: 1, h: 1 });
  });
});
