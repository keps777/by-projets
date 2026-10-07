import { describe, expect, it } from 'vitest';
import { alertesDuBloc, construireCalendrier, dateIcs, echapper, jetonValide, plier } from './logique.ts';

const evenement = (alertes = alertesDuBloc('prevue', { rappel_min: 10, rappels_avant_min: [60], alarme: false })) => ({
  uid: 'occ1', debut: '2026-10-08T13:00:00Z', fin: '2026-10-08T16:00:00Z', titre: 'Working for HQ, 3 h', detail: 'Travail · L’excellence professionnelle', alertes
});

describe('calendrier iCalendar', () => {
  it('écrit un événement avec ses alertes, lignes terminées par CRLF', () => {
    const ics = construireCalendrier([evenement()], new Date('2026-10-07T12:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('UID:occ1@luther-life');
    expect(ics).toContain('DTSTART:20261008T130000Z');
    expect(ics).toContain('DTEND:20261008T160000Z');
    expect(ics).toContain('SUMMARY:Working for HQ\\, 3 h');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain('TRIGGER:-PT60M');
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });
  it('une alarme ajoute les insistances, dont celles après le début', () => {
    const alertes = alertesDuBloc('prevue', { rappel_min: null, rappels_avant_min: [], alarme: true });
    const ics = construireCalendrier([evenement(alertes)], new Date('2026-10-07T12:00:00Z'));
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(6);
    expect(ics).toContain('TRIGGER:-PT0M');
    expect(ics).toContain('TRIGGER;RELATED=START:PT2M');
    expect(ics).toContain('DESCRIPTION:Alarme 5/5 : Working for HQ\\, 3 h');
  });
  it('un bloc déjà lancé ou fait n’a plus d’alertes', () => {
    expect(alertesDuBloc('faite', { rappel_min: 10, rappels_avant_min: [], alarme: true })).toEqual([]);
    expect(alertesDuBloc('en_cours', { rappel_min: 10, rappels_avant_min: [], alarme: true })).toEqual([]);
  });
  it('échappe et plie le texte', () => {
    expect(echapper('a;b,c\\d\ne')).toBe('a\;b\\,c\\\\d\\ne');
    const long = `DESCRIPTION:${'é'.repeat(80)}`;
    const plie = plier(long);
    for (const l of plie.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(plie.replace(/\r\n /g, '')).toBe(long);
    expect(dateIcs('2026-01-02T03:04:05Z')).toBe('20260102T030405Z');
  });
  it('n’accepte que des jetons assez longs et sûrs', () => {
    expect(jetonValide('a'.repeat(32))).toBe(true);
    expect(jetonValide('court')).toBe(false);
    expect(jetonValide('a'.repeat(31) + '/')).toBe(false);
    expect(jetonValide(null)).toBe(false);
  });
});
