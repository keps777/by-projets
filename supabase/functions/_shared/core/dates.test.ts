import { describe, it, expect } from 'vitest';
import { ajouterJours, ecartJours, jourSemaine, joursDuMois, localVersUtc, utcVersLocal, lundiDe, moisSuivant } from './dates.ts';

describe('dates', () => {
  it('calcule les jours et les mois', () => {
    expect(ajouterJours('2026-10-31', 1)).toBe('2026-11-01');
    expect(ecartJours('2026-10-15', '2026-11-23')).toBe(39);
    expect(joursDuMois('2026-02')).toBe(28);
    expect(joursDuMois('2028-02')).toBe(29);
    expect(moisSuivant('2026-12')).toBe('2027-01');
  });
  it('place les jours de la semaine (lundi = 0)', () => {
    expect(jourSemaine('2026-10-05')).toBe(0);
    expect(jourSemaine('2026-10-08')).toBe(3);
    expect(jourSemaine('2026-10-11')).toBe(6);
    expect(lundiDe('2026-10-11')).toBe('2026-10-05');
  });
  it("respecte l'heure d'été à Montréal : 05:00 reste 05:00", () => {
    const ete = localVersUtc('2026-10-05', 300, 'America/Toronto');
    const hiver = localVersUtc('2026-11-05', 300, 'America/Toronto');
    expect(new Date(ete).toISOString()).toBe('2026-10-05T09:00:00.000Z');
    expect(new Date(hiver).toISOString()).toBe('2026-11-05T10:00:00.000Z');
    expect(utcVersLocal(ete, 'America/Toronto')).toEqual({ jour: '2026-10-05', minutes: 300 });
  });
});
