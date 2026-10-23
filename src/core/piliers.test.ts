import { describe, expect, it } from 'vitest';
import { PILIERS, etatPilier, niveauRequis } from './piliers.ts';

describe('piliers et niveaux', () => {
  it('déduit le niveau requis des plafonds', () => {
    expect(niveauRequis('mobilite')).toBe('PRO');
    expect(niveauRequis('logement')).toBe('PLUS');
    expect(niveauRequis('sante')).toBe('START');
  });
  it('verrouille Mobilité et Logement en compte vierge (score 500)', () => {
    const ver = PILIERS.filter((p) => etatPilier(p.id, 500).verrouille).map((p) => p.id);
    expect(ver).toEqual(['mobilite', 'logement']);
    expect(etatPilier('mobilite', 500).manque).toBe(200);
    expect(etatPilier('logement', 599).manque).toBe(1);
  });
  it('Aïcha (742, Pro) a tout ouvert ; 650 ouvre le logement mais pas la mobilité', () => {
    expect(PILIERS.every((p) => !etatPilier(p.id, 742).verrouille)).toBe(true);
    expect(etatPilier('logement', 650).verrouille).toBe(false);
    expect(etatPilier('mobilite', 650).verrouille).toBe(true);
    expect(etatPilier('mobilite', 650).manque).toBe(50);
  });
  it('chaque pilier a un chemin et un identifiant uniques', () => {
    expect(new Set(PILIERS.map((p) => p.id)).size).toBe(PILIERS.length);
    expect(new Set(PILIERS.map((p) => p.href)).size).toBe(PILIERS.length);
  });
});
