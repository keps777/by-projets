import { describe, expect, it } from 'vitest';
import { controlerFichier, dimensionsMiniature, tailleLisible, TAILLE_MAX_FICHIER } from './miniature.ts';

describe('justificatifs importés', () => {
  it('accepte photos et PDF, refuse le reste', () => {
    expect(controlerFichier({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(controlerFichier({ type: 'application/pdf', size: 1000 })).toBeNull();
    expect(controlerFichier({ type: '', size: 1000, name: 'IMG_0042.HEIC' })).toBeNull();
    expect(controlerFichier({ type: 'application/zip', size: 1000 })).toBe('type');
    expect(controlerFichier({ type: 'image/png', size: TAILLE_MAX_FICHIER + 1 })).toBe('taille');
    expect(controlerFichier({ type: 'image/png', size: 0 })).toBe('vide');
  });
  it('miniature : grand côté ramené à 200 px, jamais agrandie', () => {
    expect(dimensionsMiniature(4000, 3000)).toEqual({ l: 200, h: 150 });
    expect(dimensionsMiniature(1000, 2000, 100)).toEqual({ l: 50, h: 100 });
    expect(dimensionsMiniature(120, 80)).toEqual({ l: 120, h: 80 });
    expect(dimensionsMiniature(0, 0)).toEqual({ l: 200, h: 200 });
  });
  it('taille lisible', () => { expect(tailleLisible(2_411_724)).toBe('2,3 Mo'); expect(tailleLisible(320 * 1024)).toBe('320 Ko'); expect(tailleLisible(10)).toBe('1 Ko'); });
});
