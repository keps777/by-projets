import { describe, expect, it } from 'vitest';
import { suiviTrajet } from './covoitSuivi.ts';

const o = (statut: 'ouverte' | 'en_route' | 'terminee' | 'annulee') => ({ jour: '2026-11-03', heure: '09:00', statut });
const t = (h: string) => Date.parse(`2026-11-03T${h}:00`);
describe('suivi du trajet', () => {
  it('avant, bientôt, attente', () => {
    expect(suiviTrajet(o('ouverte'), t('06:00'), 210)).toMatchObject({ etape: 'avant', progres: 0 });
    expect(suiviTrajet(o('ouverte'), t('08:30'), 210)).toMatchObject({ etape: 'bientot', minutesAvantDepart: 30 });
    expect(suiviTrajet(o('ouverte'), t('09:20'), 210)).toMatchObject({ etape: 'attente' });
  });
  it('en route : progression bornée ; terminé ; annulé', () => {
    expect(suiviTrajet(o('en_route'), t('10:45'), 210).progres).toBeCloseTo(0.5, 1); expect(suiviTrajet(o('en_route'), t('09:00'), 210).progres).toBe(0.05); expect(suiviTrajet(o('en_route'), t('20:00'), 210).progres).toBe(0.95);
    expect(suiviTrajet(o('terminee'), t('12:30'), 210)).toMatchObject({ etape: 'arrive', progres: 1 }); expect(suiviTrajet(o('annulee'), t('07:00'), 210).etape).toBe('annule');
  });
});
