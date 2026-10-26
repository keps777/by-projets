import { describe, expect, it } from 'vitest';
import { decompte, departDans, dansJours, dureeHeures, dureeHM, heureDe, horlogeDrop, jourCourt, jourLong, jourSemaine, nombreDe } from './format.ts';

const lundi = Date.parse('2026-10-12T09:00');
describe('formats français', () => {
  it('dates', () => {
    expect(jourLong(lundi)).toBe('lundi 12 octobre'); expect(jourCourt(Date.parse('2026-12-13T18:05'))).toBe('13 déc.');
    expect(jourSemaine(Date.parse('2026-12-14T18:05'))).toBe('lun. 14 déc.'); expect(jourSemaine(Date.parse('2026-12-14T18:05'), { avecAnnee: true, maj: true })).toBe('Lun. 14 déc. 2026');
    expect(heureDe(Date.parse('2026-12-13T18:05'))).toBe('18:05');
  });
  it('durées', () => { expect(dureeHM(425)).toBe('7 h 05'); expect(dureeHM(420)).toBe('7 h'); expect(dureeHeures(6.5)).toBe('6 h 30'); expect(dureeHeures(4.8)).toBe('4 h 48'); });
  it('comptes à rebours', () => {
    expect(decompte(((5 * 24 + 1) * 3600 + 59 * 60 + 59) * 1000)).toBe('5 j 01:59:59'); expect(decompte(3_661_000)).toBe('01:01:01'); expect(decompte(-5)).toBe('00:00:00');
    expect(horlogeDrop(271_000)).toBe('00:04:31'); expect(horlogeDrop(26 * 3600 * 1000)).toBe('26:00:00');
  });
  it('libellés de délai et pluriels', () => {
    expect(dansJours(63)).toBe('Dans 63 jours'); expect(dansJours(1)).toBe('Demain'); expect(departDans(3)).toBe('Départ dans 3 jours'); expect(departDans(0)).toBe('Départ aujourd’hui');
    expect(nombreDe(1, 'destination')).toBe('1 destination'); expect(nombreDe(4, 'destination')).toBe('4 destinations');
  });
});
