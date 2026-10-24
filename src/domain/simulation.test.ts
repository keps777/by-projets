import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../data/store.svelte.ts';
import { avancerMonde } from './simulation.ts';
describe('simulation du monde', () => {
  beforeEach(() => reinitialiser());
  it('un départ passe de prévu à embarquement, parti puis arrivé', () => {
    const d = app.monde.departs.find((x) => x.jour === new Date().toISOString().slice(0, 10) && x.heure === '12:00')!, base = new Date(`${d.jour}T12:00:00`).getTime();
    avancerMonde(base - 3_600_000); expect(d.statut).toBe('prevu'); avancerMonde(base - 10 * 60_000); expect(d.statut).toBe('embarquement'); avancerMonde(base + 60 * 60_000); expect(d.statut).toBe('parti'); expect(d.avancement).toBeGreaterThan(0);
    avancerMonde(base + 5 * 3_600_000); expect(d.statut).toBe('arrive'); expect(d.avancement).toBe(1);
  });
});
