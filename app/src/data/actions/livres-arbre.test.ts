import { describe, expect, it } from 'vitest';
import type { Note } from '@core/lignes.ts';
import { arbre, parentDe, voisin } from './livres.ts';

const n = (id: string, numero: number, p?: string): Note => ({ id, numero, texte: id, source_label: 'livre:L' + (p ? `|${JSON.stringify({ c: '', l: '', d: '2026', p })}` : '') }) as Note;

describe('arborescence des livres', () => {
  const notes = [n('a', 1), n('b', 2), n('a1', 3, 'a'), n('a2', 4, 'a'), n('a1x', 5, 'a1'), n('o', 6, 'inconnu')];
  it('ordre de lecture et numéros', () => {
    expect(arbre(notes).map((x) => `${x.numero}:${x.note.id}`)).toEqual(['1:a', '1.1:a1', '1.1.1:a1x', '1.2:a2', '2:b', '3:o']);
  });
  it('parent lu depuis l’étiquette ; parent introuvable → chapitre', () => {
    expect(parentDe(notes[2])).toBe('a'); expect(parentDe(notes[0])).toBeNull();
    expect(arbre(notes).find((x) => x.note.id === 'o')!.niveau).toBe(0);
  });
  it('voisins de même parent', () => {
    const t = arbre(notes);
    expect(voisin(t, 1, 1)?.id).toBe('a2'); expect(voisin(t, 1, -1)).toBeUndefined(); expect(voisin(t, 0, 1)?.id).toBe('b');
  });
});
