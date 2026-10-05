import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { magasin } from '../magasin.svelte.ts';
import { session } from '../auth.svelte.ts';
import { horloge } from '../temps.svelte.ts';
import { ajouterNote, modifierNote, notesDuBloc, notesDuJour, pagesDuCarnet, prochainNumero, supprimerNote, toutesLesNotes } from './notes.ts';

beforeEach(async () => {
  await magasin.fermer();
  await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
  horloge.maintenant = Date.parse('2026-10-05T18:30:00Z'); // 14:30 à Toronto
  await session.demarrer();
});

describe('Carnet', () => {
  it('numérote les notes sans interruption, quelle que soit l’origine', () => {
    expect(prochainNumero()).toBe(1);
    const a = ajouterNote({ texte: ' Pardonner vite ', origine: 'libre' })!;
    const b = ajouterNote({ texte: 'Ps 23 : il me conduit', origine: 'focus', occurrenceId: null, sourceLabel: 'RDQD du matin' })!;
    const c = ajouterNote({ texte: 'Appeler Christopher', origine: 'libre' })!;
    expect([a.numero, b.numero, c.numero]).toEqual([1, 2, 3]);
    expect(a.texte).toBe('Pardonner vite');
    expect(a.jour).toBe('2026-10-05');
    expect(a.heure).toBe(14 * 60 + 30);
    expect(b.source_label).toBe('RDQD du matin');
  });

  it('ignore une note vide', () => {
    expect(ajouterNote({ texte: '   ', origine: 'libre' })).toBeUndefined();
    expect(toutesLesNotes()).toHaveLength(0);
  });

  it('une suppression laisse un trou : les autres numéros ne changent pas, le suivant continue', () => {
    const a = ajouterNote({ texte: 'un', origine: 'libre' })!;
    const b = ajouterNote({ texte: 'deux', origine: 'libre' })!;
    ajouterNote({ texte: 'trois', origine: 'libre' });
    supprimerNote(b.id);
    expect(toutesLesNotes().map((n) => n.numero)).toEqual([1, 3]);
    expect(ajouterNote({ texte: 'quatre', origine: 'libre' })!.numero).toBe(4);
    expect(magasin.trouver('notes', a.id)!.numero).toBe(1);
  });

  it('corriger garde le numéro ; un texte vide supprime la note', () => {
    const a = ajouterNote({ texte: 'brouillon', origine: 'libre' })!;
    modifierNote(a.id, 'version finale');
    expect(magasin.trouver('notes', a.id)).toMatchObject({ texte: 'version finale', numero: 1 });
    modifierNote(a.id, '  ');
    expect(toutesLesNotes()).toHaveLength(0);
  });

  it('regroupe en pages par jour, de la plus récente à la plus ancienne, avec les numéros de … à …', () => {
    ajouterNote({ texte: 'hier', origine: 'libre' });
    horloge.maintenant = Date.parse('2026-10-06T14:00:00Z');
    ajouterNote({ texte: 'lundi 1', origine: 'libre' });
    ajouterNote({ texte: 'lundi 2', origine: 'libre' });
    const pages = pagesDuCarnet();
    expect(pages.map((p) => [p.jour, p.de, p.a])).toEqual([['2026-10-06', 2, 3], ['2026-10-05', 1, 1]]);
    expect(notesDuJour('2026-10-06').map((n) => n.texte)).toEqual(['lundi 1', 'lundi 2']);
  });

  it('retrouve les notes d’un bloc', () => {
    ajouterNote({ texte: 'a', origine: 'focus', occurrenceId: null });
    expect(notesDuBloc('inconnu')).toEqual([]);
  });
});

describe('note d’une saisie', () => {
  it('une seule note au Carnet par saisie : créée, corrigée sur place, retirée', async () => {
    const { refleterNoteDeSaisie } = await import('./notes.ts');
    refleterNoteDeSaisie('saisie-1', 'Bon moment', null, 'Lecture');
    ajouterNote({ texte: 'autre', origine: 'libre' });
    refleterNoteDeSaisie('saisie-1', 'Très bon moment', null, 'Lecture');
    const l = toutesLesNotes();
    expect(l.map((n) => [n.numero, n.texte, n.origine])).toEqual([[1, 'Très bon moment', 'saisie'], [2, 'autre', 'libre']]);
    refleterNoteDeSaisie('saisie-1', '  ', null, 'Lecture');
    expect(toutesLesNotes().map((n) => n.numero)).toEqual([2]);
  });
});
