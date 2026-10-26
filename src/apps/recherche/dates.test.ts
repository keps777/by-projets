import { describe, expect, it } from 'vitest';
import { ajouterJours, decalerMois, ecartJours, fmtAdultes, fmtDuree, fmtEscales, fmtInstant, fmtInstantCourt, fmtJourAnnee, fmtJourCourt, fmtJourLong, fmtMoisAnnee, fmtVoyageurs, jourDeSemaine, jourValide, semainesDuMois } from './dates.ts';

describe('jours', () => {
  it('valide les jours qui existent au calendrier', () => {
    expect(jourValide('2026-12-18')).toBe(true); expect(jourValide('2028-02-29')).toBe(true); expect(jourValide('2026-02-29')).toBe(false);
    expect(jourValide('2026-13-01')).toBe(false); expect(jourValide('18-12-2026')).toBe(false); expect(jourValide('')).toBe(false); expect(jourValide(null)).toBe(false);
  });
  it('calcule jours de la semaine, écarts et décalages sans dépendre du fuseau', () => {
    expect(jourDeSemaine('2026-12-18')).toBe(5); expect(ajouterJours('2026-12-30', 3)).toBe('2027-01-02'); expect(ajouterJours('2026-03-01', -1)).toBe('2026-02-28');
    expect(ecartJours('2026-12-18', '2026-12-21')).toBe(3); expect(ecartJours('2026-12-18', '2026-12-15')).toBe(-3); expect(decalerMois(2026, 12, 1)).toEqual({ annee: 2027, mois: 1 }); expect(decalerMois(2026, 1, -1)).toEqual({ annee: 2025, mois: 12 });
  });
});
describe('libellés des maquettes', () => {
  it('formate les jours', () => {
    expect(fmtJourCourt('2026-12-18')).toBe('ven. 18 déc.'); expect(fmtJourAnnee('2026-12-18')).toBe('ven. 18 déc. 2026'); expect(fmtJourLong('2026-12-18')).toBe('Vendredi 18 décembre 2026'); expect(fmtMoisAnnee('2027-02-21')).toBe('févr. 2027');
  });
  it('formate l’échéance J-1 (heure locale)', () => {
    const ms = Date.parse('2026-12-17T18:05'); expect(fmtInstant(ms)).toBe('jeu. 17 déc. 18:05'); expect(fmtInstantCourt(ms)).toBe('17 déc. 18:05');
  });
  it('formate durées, escales et voyageurs avec espaces insécables', () => {
    expect(fmtDuree(425)).toBe('7 h 05'); expect(fmtDuree(675)).toBe('11 h 15'); expect(fmtDuree(60)).toBe('1 h 00');
    expect(fmtEscales([])).toBe('Direct'); expect(fmtEscales(['KEF'])).toBe('1 escale · KEF'); expect(fmtEscales(['KEF', 'LAX'])).toBe('2 escales · KEF, LAX');
    expect(fmtVoyageurs(1)).toBe('1 voyageur'); expect(fmtVoyageurs(2)).toBe('2 voyageurs'); expect(fmtAdultes(1)).toBe('1 adulte'); expect(fmtAdultes(3)).toBe('3 adultes');
  });
});
describe('grille du calendrier', () => {
  it('commence le lundi et complète les semaines', () => {
    const s = semainesDuMois(2026, 12); // 1er décembre 2026 = mardi
    expect(s[0][0]).toBeNull(); expect(s[0][1]).toBe('2026-12-01'); expect(s.every((w) => w.length === 7)).toBe(true); expect(s.flat().filter(Boolean)).toHaveLength(31); expect(s.at(-1)!.filter(Boolean).at(-1)).toBe('2026-12-31');
  });
  it('un mois qui commence un lundi n’a pas de case vide en tête', () => { expect(semainesDuMois(2026, 6)[0][0]).toBe('2026-06-01'); });
});
