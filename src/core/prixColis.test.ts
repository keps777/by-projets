import { describe, expect, it } from 'vitest';
import { TAILLES } from './colis.ts';
import { accepteColis, arrondi100, DUREE_REFERENCE_MIN, facteurDistance, livraisonMin, prixColisLigne } from './prixColis.ts';

describe('prix d’un colis par taille et par ligne', () => {
  it('à la durée de référence, le prix est le tarif de base', () => {
    for (const t of ['S', 'M', 'L'] as const) expect(prixColisLigne(t, DUREE_REFERENCE_MIN)).toBe(TAILLES[t].prix);
  });
  it('croît avec la taille et avec la durée de la ligne', () => {
    expect(prixColisLigne('S', 195)).toBeLessThan(prixColisLigne('M', 195));
    expect(prixColisLigne('M', 195)).toBeLessThan(prixColisLigne('L', 195));
    expect(prixColisLigne('M', 190)).toBeLessThan(prixColisLigne('M', 250));
    expect(prixColisLigne('M', 420)).toBeGreaterThan(prixColisLigne('M', 250)); // Yaoundé → Bamenda
  });
  it('valeurs de la démo, arrondies à 100 F', () => {
    expect(prixColisLigne('M', 195)).toBe(2200); // 2 500 × 0,89
    expect(prixColisLigne('S', 250)).toBe(1100);
    expect(prixColisLigne('L', 180)).toBe(4100);
    for (const d of [60, 150, 190, 195, 210, 225, 250, 420, 900]) for (const t of ['S', 'M', 'L'] as const) expect(prixColisLigne(t, d) % 100).toBe(0);
  });
  it('le facteur est borné', () => {
    expect(facteurDistance(5)).toBe(0.6); expect(facteurDistance(5000)).toBe(1.8); expect(facteurDistance(220)).toBe(1);
    expect(arrondi100(2249)).toBe(2200); expect(arrondi100(2250)).toBe(2300);
  });
});

describe('quels départs prennent un colis', () => {
  it('un bus prend toutes les tailles', () => { for (const t of ['S', 'M', 'L'] as const) expect(accepteColis({ genre: 'bus' }, t)).toBe(true); });
  it('un covoiturage sans précision ne prend que S', () => {
    expect(accepteColis({ genre: 'cv' }, 'S')).toBe(true); expect(accepteColis({ genre: 'cv' }, 'M')).toBe(false); expect(accepteColis({ genre: 'cv' }, 'L')).toBe(false);
  });
  it('colisOk élargit à M (jamais L), colisOk false refuse tout', () => {
    expect(accepteColis({ genre: 'cv', colisOk: true }, 'M')).toBe(true); expect(accepteColis({ genre: 'cv', colisOk: true }, 'L')).toBe(false);
    expect(accepteColis({ genre: 'cv', colisOk: false }, 'S')).toBe(false);
  });
  it('la livraison compte le retard annoncé', () => { expect(livraisonMin(195)).toBe(195); expect(livraisonMin(195, 20)).toBe(215); expect(livraisonMin(195, -5)).toBe(195); });
});
