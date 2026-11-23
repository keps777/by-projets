// Bibliothèque (spec §18, nov. 2026) : un livre = une note « couverture » (titre, couleur) + des notes « chapitre » qui portent son identifiant.
// Aucune colonne de plus : tout vit dans `notes` (`source_label` = `livre-couv:<id>` ou `livre:<id>`). Le journal du jour ne les montre pas.
import type { Note } from '@core/lignes.ts';
import { nouvelId } from '@core/ids.ts';
import { magasin } from '../magasin.svelte.ts';
import { ajouterNote, ajouterNoteRiche, modifierNote, supprimerNote, toutesLesNotes } from './notes.ts';

export const COULEURS_LIVRE = ['#B5452F', '#C9772B', '#C9A227', '#4E8F5A', '#1F7A6D', '#2F6DB5', '#4B4FB5', '#7B4BB5', '#B54B8A', '#6B5B4E', '#3A3F4B', '#111318'];
const COUV = 'livre-couv:', CHAP = 'livre:';

export interface Livre { id: string; titre: string; couleur: string; note: Note; chapitres: Note[]; mots: number; pages: number }
export const estDeLivre = (n: Pick<Note, 'source_label'>): boolean => !!n.source_label && (n.source_label.startsWith(COUV) || n.source_label.startsWith(CHAP));

export const compterMots = (t: string): number => (t.match(/[\p{L}\p{N}’'-]+/gu) ?? []).length;
/** Une « page » de livre : environ 250 mots. */
export const pagesDe = (mots: number): number => (mots ? Math.max(1, Math.ceil(mots / 250)) : 0);
/** Titre d'un chapitre : sa première ligne (un titre de la note riche, sinon le début du texte). */
export const titreChapitre = (n: Pick<Note, 'texte'>): string => (n.texte.split('\n').find((l) => l.trim()) ?? 'Sans titre').replace(/^[•\d.\s]+/, '').slice(0, 80);

function lireCouverture(n: Note): { titre: string; couleur: string } {
  try { const j = JSON.parse(n.texte); return { titre: String(j.titre || 'Sans titre'), couleur: COULEURS_LIVRE.includes(j.couleur) || /^#[0-9a-f]{6}$/i.test(j.couleur) ? j.couleur : COULEURS_LIVRE[0] }; } catch { return { titre: 'Sans titre', couleur: COULEURS_LIVRE[0] }; }
}

export function livres(): Livre[] {
  const toutes = toutesLesNotes();
  return toutes.filter((n) => n.source_label?.startsWith(COUV)).map((note) => {
    const id = note.source_label!.slice(COUV.length);
    const chapitres = toutes.filter((n) => n.source_label === CHAP + id);
    const mots = chapitres.reduce((t, c) => t + compterMots(c.texte), 0);
    return { id, ...lireCouverture(note), note, chapitres, mots, pages: pagesDe(mots) };
  });
}

export function creerLivre(titre: string, couleur: string): string | undefined {
  const t = titre.trim();
  if (!t) return undefined;
  const id = nouvelId();
  ajouterNote({ texte: JSON.stringify({ titre: t, couleur }), origine: 'libre', sourceLabel: COUV + id });
  return id;
}
export function modifierLivre(l: Livre, titre: string, couleur: string): void { if (titre.trim()) modifierNote(l.note.id, JSON.stringify({ titre: titre.trim(), couleur })); }
export function supprimerLivre(l: Livre): void { for (const c of l.chapitres) supprimerNote(c.id); supprimerNote(l.note.id); }
export function ajouterChapitre(livreId: string, html: string): Note | undefined { return ajouterNoteRiche(html, { origine: 'libre', sourceLabel: CHAP + livreId }); }
/** Remet les chapitres dans un autre ordre : les numéros sont échangés (le livre se lit dans l'ordre des numéros). */
export function echangerChapitres(a: Note, b: Note): void { magasin.ecrire('notes', { id: a.id, numero: b.numero }); magasin.ecrire('notes', { id: b.id, numero: a.numero }); }
