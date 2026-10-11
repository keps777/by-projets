import { describe, it, expect } from 'vitest';
import { periodeAdaptee, regleDecalee } from './reprise.ts';

describe('periodeAdaptee', () => {
  it('un mois entier devient le mois en cours', () => {
    expect(periodeAdaptee('2026-08-01', '2026-08-31', '2026-10-11')).toEqual({ debut: '2026-10-01', fin: '2026-10-31', decalage: 61 });
  });
  it('une semaine entière devient la semaine en cours', () => {
    expect(periodeAdaptee('2026-09-07', '2026-09-13', '2026-10-11')).toMatchObject({ debut: '2026-10-05', fin: '2026-10-11' });
  });
  it('sans fin reste sans fin et commence aujourd’hui', () => {
    expect(periodeAdaptee('2026-01-15', null, '2026-10-11')).toMatchObject({ debut: '2026-10-11', fin: null });
  });
  it('une autre période garde sa durée (30 jours) et commence aujourd’hui', () => {
    expect(periodeAdaptee('2026-03-10', '2026-04-08', '2026-10-11')).toEqual({ debut: '2026-10-11', fin: '2026-11-09', decalage: 215 });
  });
});

describe('regleDecalee', () => {
  it('glisse le début et la date de fin, garde le reste', () => {
    const r = regleDecalee({ frequence: 'hebdo', debut: '2026-08-03', jours: [0, 2], fin: { type: 'date', date: '2026-08-31' } }, 63);
    expect(r).toEqual({ frequence: 'hebdo', debut: '2026-10-05', jours: [0, 2], fin: { type: 'date', date: '2026-11-02' } });
  });
  it('ne touche pas une fin « fois » ou « aucune »', () => {
    expect(regleDecalee({ frequence: 'quotidien', debut: '2026-08-03', fin: { type: 'fois', fois: 5 } }, 7).fin).toEqual({ type: 'fois', fois: 5 });
  });
});
