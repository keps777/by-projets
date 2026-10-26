import { describe, expect, it } from 'vitest';
import { NB, PROMESSES, annonce, apresTouche, borner, compteARebours, decompteSuivant, indexDepuisDefilement, libellePoint } from './promesses.ts';

describe('promesses', () => {
  it('sont trois, dans l’ordre voyager → revendre → nommer', () => {
    expect(NB).toBe(3); expect(PROMESSES.map((p) => p.id)).toEqual(['voyager', 'revendre', 'nommer']);
    expect(PROMESSES.map((p) => p.kicker)).toEqual(['1 / 3 · Voyager', '2 / 3 · Revendre', '3 / 3 · Nommer']);
  });
  it('ne promettent aucun gain', () => { for (const p of PROMESSES) expect(`${p.titre} ${p.texte}`.toLowerCase()).not.toMatch(/gain garanti|rendement/); });
  it('bornent l’indice de diapositive', () => { expect(borner(-2)).toBe(0); expect(borner(9)).toBe(2); expect(borner(1.4)).toBe(1); });
  it('naviguent au clavier sans dépasser les bords', () => {
    expect(apresTouche('ArrowRight', 0)).toBe(1); expect(apresTouche('ArrowRight', 2)).toBe(2);
    expect(apresTouche('ArrowLeft', 2)).toBe(1); expect(apresTouche('ArrowLeft', 0)).toBe(0);
    expect(apresTouche('Home', 2)).toBe(0); expect(apresTouche('End', 0)).toBe(2); expect(apresTouche('Tab', 0)).toBeNull(); expect(apresTouche('a', 1)).toBeNull();
  });
  it('lisent la diapositive visible sur la position de défilement', () => {
    expect(indexDepuisDefilement(0, 390)).toBe(0); expect(indexDepuisDefilement(200, 390)).toBe(1); expect(indexDepuisDefilement(780, 390)).toBe(2); expect(indexDepuisDefilement(50, 0)).toBe(0);
  });
  it('annoncent le numéro de la diapositive', () => {
    expect(annonce(1)).toBe('Diapositive 2 sur 3 : Revendre'); expect(libellePoint(2)).toBe('Page 3 sur 3 : Nommer le voyageur');
  });
  it('formatent le décompte de démonstration', () => {
    expect(compteARebours(86382)).toBe('23:59:42'); expect(compteARebours(61)).toBe('00:01:01'); expect(compteARebours(-5)).toBe('00:00:00');
    expect(decompteSuivant(10)).toBe(9); expect(decompteSuivant(1)).toBe(86399);
  });
});
