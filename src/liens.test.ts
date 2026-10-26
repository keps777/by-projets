// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ROUTES } from './router.svelte.ts';

describe('routes', () => {
  it('ont un chemin unique, un titre et un composant', () => {
    const chemins = ROUTES.map((r) => r.chemin); expect(new Set(chemins).size).toBe(chemins.length);
    for (const r of ROUTES) { expect(r.titre, r.chemin).toBeTruthy(); expect(typeof r.composant, r.chemin).toBe('function'); expect(r.chemin.startsWith('/'), r.chemin).toBe(true); }
  });
});
