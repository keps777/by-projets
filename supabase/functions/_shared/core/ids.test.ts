import { describe, it, expect } from 'vitest';
import { uuidDeterministe, idOccurrence, cleRappelBloc } from './ids.ts';

describe('identifiants déterministes', () => {
  it('donnent le même identifiant pour la même occurrence', () => {
    const t = '11111111-2222-4333-8444-555555555555';
    expect(idOccurrence(t, '2026-10-08')).toBe(idOccurrence(t, '2026-10-08'));
    expect(idOccurrence(t, '2026-10-08')).not.toBe(idOccurrence(t, '2026-10-09'));
  });
  it('ont la forme d’un UUID', () => {
    expect(uuidDeterministe('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(cleRappelBloc('abc', 10)).toBe('abc:10');
  });
});
