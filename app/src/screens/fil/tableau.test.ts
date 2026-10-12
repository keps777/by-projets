import { describe, expect, it } from 'vitest';
import { arriveeDe, colonneDe, gesteDe, repartir } from './tableau.ts';

const b = (p: { etat?: string; fait?: boolean; enCours?: boolean; enPause?: boolean; debutMin?: number }) => ({
  fait: p.fait ?? false, enCours: p.enCours ?? false, enPause: p.enPause ?? false, debutMin: p.debutMin ?? 600, occ: { etat: p.etat ?? 'prevue' }
}) as never;

describe('colonneDe', () => {
  const auj = '2026-10-12';
  it('aujourd’hui : avant l’heure = prêtes, heure venue = à faire', () => {
    expect(colonneDe(b({ debutMin: 22 * 60 }), auj, auj, 18 * 60)).toBe('pretes');
    expect(colonneDe(b({ debutMin: 9 * 60 }), auj, auj, 18 * 60)).toBe('afaire');
  });
  it('un jour passé non fait est à faire ; un jour à venir est prêt', () => {
    expect(colonneDe(b({}), '2026-10-10', auj, 600)).toBe('afaire');
    expect(colonneDe(b({}), '2026-10-14', auj, 600)).toBe('pretes');
  });
  it('en cours (ou en pause) et terminées passent avant l’heure', () => {
    expect(colonneDe(b({ enCours: true, etat: 'en_cours' }), auj, auj, 0)).toBe('encours');
    expect(colonneDe(b({ enPause: true, etat: 'pause' }), '2026-10-14', auj, 0)).toBe('encours');
    expect(colonneDe(b({ fait: true, etat: 'faite' }), '2026-10-14', auj, 0)).toBe('terminees');
  });
  it('un bloc ignoré n’est dans aucune colonne', () => { expect(colonneDe(b({ etat: 'ignoree' }), auj, auj, 0)).toBeNull(); });
});

describe('repartir', () => {
  it('range et trie par heure de début', () => {
    const r = repartir([b({ debutMin: 700 }), b({ debutMin: 650 }), b({ fait: true, etat: 'faite' })], '2026-10-14', '2026-10-12', 0) as Record<string, { debutMin: number }[]>;
    expect(r.pretes.map((x) => x.debutMin)).toEqual([650, 700]);
    expect(r.terminees).toHaveLength(1);
  });
});

describe('gestes', () => {
  it('droite : lancer puis terminer ; rien après « terminées »', () => {
    expect(gesteDe('pretes', 1)).toBe('lancer');
    expect(gesteDe('afaire', 1)).toBe('lancer');
    expect(gesteDe('encours', 1)).toBe('terminer');
    expect(gesteDe('terminees', 1)).toBeNull();
  });
  it('gauche : en cours et terminées redeviennent à faire ; rien avant', () => {
    expect(gesteDe('terminees', -1)).toBe('remettre');
    expect(gesteDe('encours', -1)).toBe('remettre');
    expect(gesteDe('afaire', -1)).toBeNull();
    expect(gesteDe('pretes', -1)).toBeNull();
  });
  it('arrivée annoncée', () => {
    expect(arriveeDe('afaire', 1)).toBe('encours');
    expect(arriveeDe('encours', 1)).toBe('terminees');
    expect(arriveeDe('terminees', -1)).toBe('afaire_ou_pretes');
  });
});
