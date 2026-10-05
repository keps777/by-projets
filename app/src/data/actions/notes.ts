// Le Carnet (spec §18) : un livre de notes numérotées sans interruption, une page par jour.
import type { Jour } from '@core/types.ts';
import type { Note, OrigineNote } from '@core/lignes.ts';
import { nouvelId, uuidDeterministe } from '@core/ids.ts';
import { magasin } from '../magasin.svelte.ts';
import { maintenantLocal } from '../temps.svelte.ts';

/** Toutes les notes, dans l'ordre du livre (numéro croissant). */
export const toutesLesNotes = (): Note[] => [...magasin.lignes.notes].sort((a, b) => a.numero - b.numero);

export const notesDuJour = (jour: Jour): Note[] => toutesLesNotes().filter((n) => n.jour === jour);

export const notesDuBloc = (occId: string): Note[] => toutesLesNotes().filter((n) => n.occurrence_id === occId);

/** Numéro de la prochaine note : le plus grand numéro + 1 (jamais de renumérotation). */
export function prochainNumero(): number {
  return magasin.lignes.notes.reduce((m, n) => Math.max(m, n.numero), 0) + 1;
}

export interface NouvelleNote {
  texte: string;
  origine: OrigineNote;
  /** Bloc pendant lequel la note est écrite (Focus, volet). */
  occurrenceId?: string | null;
  projetId?: string | null;
  /** Titre du bloc, copié pour garder la référence si le bloc disparaît. */
  sourceLabel?: string | null;
  /** Identifiant imposé (note miroir d'une saisie : une seule note par saisie). */
  id?: string;
}

/** Ajoute une note au livre, avec le numéro suivant, le jour et l'heure d'aujourd'hui. Rend la note, ou undefined si le texte est vide. */
export function ajouterNote(n: NouvelleNote): Note | undefined {
  const texte = n.texte.trim();
  if (!texte) return undefined;
  const id = n.id ?? nouvelId();
  const { jour, minutes } = maintenantLocal();
  magasin.ecrire('notes', {
    id, jour, texte, numero: prochainNumero(), origine: n.origine, heure: Math.min(1439, Math.max(0, Math.floor(minutes))),
    occurrence_id: n.occurrenceId ?? null, projet_id: n.projetId ?? null, source_label: n.sourceLabel ?? null
  });
  return magasin.trouver('notes', id);
}

/** Corrige le texte d'une note ; un texte vide la supprime. Le numéro, le jour et l'heure ne changent pas. */
export function modifierNote(id: string, texte: string): void {
  const t = texte.trim();
  if (!t) { supprimerNote(id); return; }
  magasin.ecrire('notes', { id, texte: t });
}

/** Supprime une note : son numéro reste vacant, les autres ne changent pas. */
export function supprimerNote(id: string): void { magasin.supprimer('notes', id); }

/** Les pages du livre : un jour, ses notes, le premier et le dernier numéro. Du plus récent au plus ancien. */
export function pagesDuCarnet(): { jour: Jour; notes: Note[]; de: number; a: number }[] {
  const parJour = new Map<Jour, Note[]>();
  for (const n of toutesLesNotes()) parJour.set(n.jour, [...(parJour.get(n.jour) ?? []), n]);
  return [...parJour.entries()]
    .map(([jour, notes]) => ({ jour, notes, de: notes[0].numero, a: notes[notes.length - 1].numero }))
    .sort((x, y) => (x.jour < y.jour ? 1 : -1));
}

/**
 * Reflète la note d'une saisie manuelle (sous-projet) dans le Carnet : une seule note par saisie, mise à jour ou retirée
 * avec elle. Le numéro et le jour d'écriture ne changent pas quand le texte est corrigé.
 */
export function refleterNoteDeSaisie(saisieId: string, texte: string | null, projetId: string | null, sourceLabel: string | null): void {
  const id = uuidDeterministe(`note:saisie:${saisieId}`);
  const existante = magasin.trouver('notes', id);
  const t = texte?.trim() ?? '';
  if (!t) { if (existante) supprimerNote(id); return; }
  if (existante) { if (existante.texte !== t) modifierNote(id, t); return; }
  ajouterNote({ id, texte: t, origine: 'saisie', projetId, sourceLabel });
}
