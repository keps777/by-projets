import { describe, expect, it } from 'vitest';
import { joursDePages, numerosDePage, pageVoisine, provenance } from './carnet.ts';

describe('provenance d’une note', () => {
  it('dit d’où elle vient et à quelle heure', () => {
    expect(provenance({ origine: 'libre', source_label: null, heure: 14 * 60 + 3 })).toBe('Note libre · 14:03');
    expect(provenance({ origine: 'focus', source_label: 'RDQD du matin', heure: 5 * 60 + 12 })).toBe('Focus · RDQD du matin · 05:12');
    expect(provenance({ origine: 'bloc', source_label: 'Prière seule', heure: null })).toBe('Prière seule');
    expect(provenance({ origine: 'saisie', source_label: '7 chapitres par jour', heure: 600 })).toBe('Saisie · 7 chapitres par jour · 10:00');
  });
});

describe('pages du livre', () => {
  const notes = [{ jour: '2026-10-03' }, { jour: '2026-10-03' }, { jour: '2026-10-05' }];
  it('un jour à notes = une page, plus aujourd’hui', () => {
    expect(joursDePages(notes, '2026-10-07')).toEqual(['2026-10-03', '2026-10-05', '2026-10-07']);
    expect(joursDePages([], '2026-10-07')).toEqual(['2026-10-07']);
    expect(joursDePages(notes, '2026-10-05')).toEqual(['2026-10-03', '2026-10-05']);
  });
  it('page voisine dans les deux sens, null aux extrémités', () => {
    const j = joursDePages(notes, '2026-10-07');
    expect(pageVoisine(j, '2026-10-05', -1)).toBe('2026-10-03');
    expect(pageVoisine(j, '2026-10-05', 1)).toBe('2026-10-07');
    expect(pageVoisine(j, '2026-10-03', -1)).toBeNull();
    expect(pageVoisine(j, '2026-10-07', 1)).toBeNull();
    expect(pageVoisine(j, '2026-10-04', 1)).toBe('2026-10-05');
    expect(pageVoisine(j, '2026-10-04', -1)).toBe('2026-10-03');
  });
  it('numéros d’une page', () => {
    expect(numerosDePage(4, 4)).toBe('n° 4');
    expect(numerosDePage(4, 9)).toBe('n° 4–9');
  });
});
