import { describe, expect, it } from 'vitest';
import { dureeVol, heure, initiales, instantDuJour, jourCompletCapitale, jourCourt, jourMois, jourMoisAHeure, jourMoisHeure, jourMoisSiAnnee, moisLong, nomCourt } from './dates.ts';

const DEP = Date.parse('2026-12-18T18:05');
describe('dates en français', () => {
  it('formate jour, heure et mois comme les maquettes', () => {
    expect(heure(DEP)).toBe('18:05'); expect(jourMois(DEP)).toBe('18 déc.'); expect(jourCourt(DEP)).toBe('ven. 18 déc.'); expect(jourMoisHeure(DEP - 86_400_000)).toBe('17 déc. 18:05');
    expect(jourMoisAHeure(DEP - 86_400_000)).toBe('17 déc. à 18:05'); expect(jourCompletCapitale(Date.parse('2026-12-14T18:05'))).toBe('Lun. 14 déc. 2026'); expect(moisLong(DEP)).toBe('décembre');
  });
  it('ajoute l’année seulement si elle diffère de celle de référence', () => {
    expect(jourMoisSiAnnee(Date.parse('2026-01-12T10:14'), DEP)).toBe('12 janv.'); expect(jourMoisSiAnnee(Date.parse('2025-01-12T10:14'), DEP)).toBe('12 janv. 2025');
  });
  it('calcule un instant avec décalage de jours (arrivée du lendemain)', () => {
    expect(instantDuJour('2026-12-14', '07:10', 1)).toBe(Date.parse('2026-12-15T07:10')); expect(instantDuJour('2026-12-31', '23:30', 1)).toBe(Date.parse('2027-01-01T23:30'));
  });
  it('durée, initiales, nom court', () => {
    expect(dureeVol(425)).toBe('7 h 05'); expect(dureeVol(615)).toBe('10 h 15'); expect(initiales('Alex', 'Tremblay')).toBe('AT'); expect(nomCourt('Alex', 'Tremblay')).toBe('Alex T.'); expect(nomCourt('Léa', '')).toBe('Léa');
  });
});
