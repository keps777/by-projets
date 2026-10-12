import { describe, expect, it } from 'vitest';
import { arriveeDe, colonneDe, enRetard, gesteDe, repartir } from './tableau.ts';

const b = (p: { etat?: string; fait?: boolean; enCours?: boolean; enPause?: boolean; debutMin?: number }) => ({
  fait: p.fait ?? false, enCours: p.enCours ?? false, enPause: p.enPause ?? false, debutMin: p.debutMin ?? 600, occ: { etat: p.etat ?? 'prevue' }
}) as never;

describe('colonneDe', () => {
  it('prévu = prêt (avant comme après l’heure)', () => { expect(colonneDe(b({}))).toBe('pret'); });
  it('minuteur en cours ou en pause = en cours', () => {
    expect(colonneDe(b({ enCours: true, etat: 'en_cours' }))).toBe('encours');
    expect(colonneDe(b({ enPause: true, etat: 'pause' }))).toBe('encours');
  });
  it('fait = terminé, même si un minuteur a tourné', () => { expect(colonneDe(b({ fait: true, etat: 'faite' }))).toBe('termine'); });
  it('un bloc ignoré n’est dans aucune colonne', () => { expect(colonneDe(b({ etat: 'ignoree' }))).toBeNull(); });
});

describe('repartir', () => {
  it('range en trois colonnes et trie par heure de début', () => {
    const r = repartir([b({ debutMin: 700 }), b({ debutMin: 650 }), b({ fait: true, etat: 'faite' }), b({ enCours: true, etat: 'en_cours' })]) as Record<string, { debutMin: number }[]>;
    expect(r.pret.map((x) => x.debutMin)).toEqual([650, 700]);
    expect(r.encours).toHaveLength(1);
    expect(r.termine).toHaveLength(1);
  });
});

describe('enRetard', () => {
  it('aujourd’hui : après l’heure de début seulement', () => {
    expect(enRetard({ debutMin: 540 }, '2026-10-12', '2026-10-12', 600)).toBe(true);
    expect(enRetard({ debutMin: 1320 }, '2026-10-12', '2026-10-12', 600)).toBe(false);
  });
  it('jour passé : oui ; jour à venir : non', () => {
    expect(enRetard({ debutMin: 1320 }, '2026-10-10', '2026-10-12', 0)).toBe(true);
    expect(enRetard({ debutMin: 0 }, '2026-10-14', '2026-10-12', 600)).toBe(false);
  });
});

describe('gestes', () => {
  it('droite : lancer puis terminer ; rien après « terminé »', () => {
    expect(gesteDe('pret', 1)).toBe('lancer');
    expect(gesteDe('encours', 1)).toBe('terminer');
    expect(gesteDe('termine', 1)).toBeNull();
  });
  it('gauche : en cours et terminé redeviennent prêt ; rien avant', () => {
    expect(gesteDe('termine', -1)).toBe('remettre');
    expect(gesteDe('encours', -1)).toBe('remettre');
    expect(gesteDe('pret', -1)).toBeNull();
  });
  it('arrivée annoncée', () => {
    expect(arriveeDe('pret', 1)).toBe('encours');
    expect(arriveeDe('encours', 1)).toBe('termine');
    expect(arriveeDe('termine', -1)).toBe('pret');
    expect(arriveeDe('pret', -1)).toBeNull();
  });
});
