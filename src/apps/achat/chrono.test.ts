import { describe, expect, it } from 'vitest';
import { chronologie, compteARebours, libelleJ, peutNommer, phraseReste, statutVoyage, voletsEcheance } from './chrono.ts';

const MAI = Date.parse('2026-10-12T09:00');
const VOL = { jour: '2026-12-14', heureDepart: '18:05' };
describe('chronologie J-1', () => {
  it('J-63 au départ, 62 jours avant l’échéance (13 déc. 18:05)', () => {
    const c = chronologie(VOL, MAI); expect(c.joursDepart).toBe(63); expect(c.joursEcheance).toBe(62); expect(c.echeance).toBe(Date.parse('2026-12-13T18:05')); expect(c.ouvert).toBe(true); expect(c.phase).toBe('ouvert');
    expect(libelleJ(c.joursDepart)).toBe('J-63');
  });
  it('« 62 j 0 h » et volets 62 J / 00 H quand l’échéance tombe 62 jours pile plus tard', () => {
    const maintenant = Date.parse('2026-10-12T18:05'), c = chronologie(VOL, maintenant); expect(phraseReste(c.resteMs)).toBe('Il reste 62 j 0 h'); expect(voletsEcheance(c.resteMs)).toEqual({ jours: '62', heures: '00' });
  });
  it('à moins de 24 h de l’échéance : heures seules, puis échéance passée', () => {
    const c = chronologie(VOL, Date.parse('2026-12-13T14:53')); expect(phraseReste(c.resteMs)).toBe('Il reste 3 h 12 min'); expect(voletsEcheance(c.resteMs)).toEqual({ jours: '00', heures: '03' });
    const p = chronologie(VOL, Date.parse('2026-12-13T18:05')); expect(p.ouvert).toBe(false); expect(p.phase).toBe('ferme'); expect(phraseReste(p.resteMs)).toBe('L’échéance est passée'); expect(voletsEcheance(p.resteMs)).toEqual({ jours: '00', heures: '00' });
  });
  it('jour du départ et vol parti', () => { expect(libelleJ(0)).toBe('Jour J'); expect(chronologie(VOL, Date.parse('2026-12-14T20:00')).phase).toBe('parti'); });
  it('compte à rebours jusqu’au décollage', () => {
    expect(compteARebours(Date.parse('2026-12-14T18:05'), MAI)).toBe('63 j 09:05:00'); expect(compteARebours(Date.parse('2026-12-14T18:05'), Date.parse('2026-12-14T18:04:59'))).toBe('0 j 00:00:01'); expect(compteARebours(1000, 5000)).toBe('0 j 00:00:00');
  });
  it('statut et possibilité de nommer', () => {
    expect(statutVoyage({ statut: 'detenu' })).toBe('a_nommer'); expect(statutVoyage({ statut: 'en_vente' })).toBe('a_nommer'); expect(statutVoyage({ statut: 'nomme' })).toBe('nomme'); expect(statutVoyage({ statut: 'voyage' })).toBe('parti'); expect(statutVoyage({ statut: 'vendu' })).toBe('autre');
    expect(peutNommer({ statut: 'detenu' }, chronologie(VOL, MAI))).toBe(true); expect(peutNommer({ statut: 'nomme' }, chronologie(VOL, MAI))).toBe(false); expect(peutNommer({ statut: 'detenu' }, chronologie(VOL, Date.parse('2026-12-14T00:00')))).toBe(false);
  });
});
