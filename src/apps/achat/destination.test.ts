import { describe, expect, it } from 'vitest';
import { decalageMinutes, heureAilleurs, heureArriveeAMontreal, jourAilleurs, libelleDecalage, nomAeroport, paysAvecPreposition, phraseDecalage } from './destination.ts';

describe('destination', () => {
  it('décalage de Paris : 6 h en décembre comme en octobre', () => { expect(decalageMinutes('CDG', '2026-12-14')).toBe(360); expect(decalageMinutes('CDG', '2026-10-12')).toBe(360); expect(decalageMinutes('YUL', '2026-12-14')).toBe(0); });
  it('autres destinations : Tokyo, Los Angeles, Bogotá', () => { expect(decalageMinutes('NRT', '2026-12-14')).toBe(840); expect(decalageMinutes('LAX', '2026-12-14')).toBe(-180); expect(decalageMinutes('BOG', '2026-12-14')).toBe(0); expect(decalageMinutes('XXX', '2026-12-14')).toBe(0); });
  it('libellés et phrases', () => {
    expect(libelleDecalage(360)).toBe('+6 h'); expect(libelleDecalage(-180)).toBe('−3 h'); expect(libelleDecalage(0)).toBe('0 h'); expect(libelleDecalage(570)).toBe('+9 h 30');
    expect(phraseDecalage('Paris', 360, 'décembre')).toBe('Paris a 6 h d’avance sur Montréal en décembre.'); expect(phraseDecalage('Los Angeles', -180, 'mars')).toBe('Los Angeles a 3 h de retard sur Montréal en mars.'); expect(phraseDecalage('Bogotá', 0, 'mai')).toMatch(/même heure/);
  });
  it('heure locale ailleurs, avec changement de jour', () => {
    const a = heureAilleurs(Date.parse('2026-10-12T20:30:15'), 360); expect(a.hms).toBe('02:30:15'); expect(jourAilleurs(a.jour)).toBe('mar. 13 oct.');
    expect(heureAilleurs(Date.parse('2026-10-12T09:00:00'), -180).hm).toBe('06:00');
  });
  it('arrivée 07:10 à Paris = 01:10 à Montréal', () => { expect(heureArriveeAMontreal('07:10', 360)).toBe('01:10'); expect(heureArriveeAMontreal('02:00', 360)).toBe('20:00'); });
  it('noms et prépositions', () => { expect(nomAeroport('CDG', 'Paris')).toBe('Paris-Charles de Gaulle'); expect(nomAeroport('ZZZ', 'Ailleurs')).toBe('Ailleurs'); expect(paysAvecPreposition('France')).toBe('en France'); expect(paysAvecPreposition('Cuba')).toBe('à Cuba'); expect(paysAvecPreposition('Atlantide')).toMatch(/pays de destination/); });
});
