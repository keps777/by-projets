import { describe, expect, it } from 'vitest';
import { edition, personnagesVisibles } from './edition.ts';

describe('édition', () => {
  it('vaut « agence » par défaut et montre les personnages', () => {
    expect(edition('')).toBe('agence');
    expect(edition('inconnue')).toBe('agence');
    expect(personnagesVisibles('agence')).toBe(true);
  });
  it('« particulier » masque les personnages', () => {
    expect(edition('particulier')).toBe('particulier');
    expect(personnagesVisibles('particulier')).toBe(false);
  });
});
