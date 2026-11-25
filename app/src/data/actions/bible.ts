// Bible intégrée (spec §19) : textes libres de droits servis en fichiers par livre (/bible/<version>/<n>.json = chapitres → versets),
// position de lecture et version retenues sur l'appareil, soulignements gardés dans les notes (une note par chapitre).
import { LIVRES } from '@core/bible.ts';
import { magasin } from '../magasin.svelte.ts';
import { ajouterNote, modifierNote, toutesLesNotes } from './notes.ts';
import { SURL, creerLivre, livres, ajouterChapitre, type Signature } from './livres.ts';

export interface Version { id: string; court: string; nom: string; detail: string }
export const VERSIONS: Version[] = [
  { id: 'darby', court: 'DARBY', nom: 'Darby', detail: 'Français · J. N. Darby' },
  { id: 'martin', court: 'MARTIN', nom: 'Martin 1744', detail: 'Français · David Martin' },
  { id: 'kjv', court: 'KJV', nom: 'King James', detail: 'English · 1769' }
];
export const NOMS_EN = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'];
export const NB_ANCIEN = 39;
export const nomLivre = (l: number, version: string): string => (version === 'kjv' ? NOMS_EN[l] : LIVRES[l].nom) ?? LIVRES[l].nom;
export const referenceTexte = (l: number, c: number, versets: number[], version: string): string => {
  const v = [...versets].sort((a, b) => a - b);
  const plages: string[] = [];
  for (let i = 0; i < v.length; i++) { let j = i; while (v[j + 1] === v[j] + 1) j++; plages.push(j > i ? `${v[i]}-${v[j]}` : `${v[i]}`); i = j; }
  return `${nomLivre(l, version)} ${c}${plages.length ? ':' + plages.join(', ') : ''}`;
};

export interface Position { v: string; l: number; c: number }
const CLE = 'luther-life:bible';
export function positionRetenue(): Position {
  try { const j = JSON.parse(localStorage.getItem(CLE) ?? 'null'); if (j && VERSIONS.some((x) => x.id === j.v) && Number.isInteger(j.l) && j.l >= 0 && j.l < 66 && j.c >= 1) return { v: j.v, l: j.l, c: j.c }; } catch { /* aucune */ }
  return { v: 'darby', l: 0, c: 1 };
}
export const retenirPosition = (p: Position): void => { try { localStorage.setItem(CLE, JSON.stringify(p)); } catch { /* ignoré */ } };

const memoire = new Map<string, Promise<string[][]>>();
/** Chapitres (listes de versets) d'un livre dans une version ; chargé une fois puis gardé (le service worker le garde aussi hors ligne). */
export function chargerLivre(version: string, l: number): Promise<string[][]> {
  const k = `${version}/${l}`;
  let p = memoire.get(k);
  if (!p) {
    p = fetch(`/bible/${k}.json`).then((r) => { if (!r.ok) throw new Error('texte indisponible'); return r.json() as Promise<string[][]>; });
    p.catch(() => memoire.delete(k));
    memoire.set(k, p);
  }
  return p;
}

// ---- soulignements : { numéro de verset → couleur } pour un chapitre
export const COULEURS_SURL = [{ id: 'jaune', hex: '#F2C94C' }, { id: 'vert', hex: '#6FCF97' }, { id: 'bleu', hex: '#56B3F5' }, { id: 'rose', hex: '#F2849E' }, { id: 'violet', hex: '#B38AF2' }] as const;
const etiquetteSurl = (l: number, c: number) => `${SURL}${l}.${c}`;
const noteSurl = (l: number, c: number) => toutesLesNotes().find((n) => n.source_label === etiquetteSurl(l, c));
export function surlignagesDe(l: number, c: number): Record<number, string> {
  const n = noteSurl(l, c);
  if (!n) return {};
  try { const j = JSON.parse(n.texte); return j && typeof j === 'object' ? (j as Record<number, string>) : {}; } catch { return {}; }
}
/** Souligne (couleur) ou efface (null) des versets d'un chapitre. */
export function surligner(l: number, c: number, versets: number[], couleur: string | null): void {
  const actuel = { ...surlignagesDe(l, c) };
  for (const v of versets) { if (couleur) actuel[v] = couleur; else delete actuel[v]; }
  const n = noteSurl(l, c);
  const texte = JSON.stringify(actuel);
  if (n) { if (Object.keys(actuel).length) modifierNote(n.id, texte); else magasin.supprimer('notes', n.id); }
  else if (Object.keys(actuel).length) ajouterNote({ texte, origine: 'libre', sourceLabel: etiquetteSurl(l, c) });
}

// ---- notes de lecture : un cahier (livre de la bibliothèque), une note = une page sans titre
export const TITRE_CAHIER = 'Notes durant mes lectures bibliques';
/** Le cahier existe déjà sous un nom proche (« Notes durant mes lectures bibliques », « Notes pendant ma lecture biblique »…) : on le reprend. */
const estCahier = (titre: string) => /notes?.*lectures?\s+bibliques?/i.test(titre.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
export function cahierBiblique(): string | undefined {
  return livres().find((x) => estCahier(x.titre))?.id ?? creerLivre(TITRE_CAHIER, '#7B4BB5', 'Bible');
}
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Page de départ : titre laissé vide, ta note d'abord, le(s) verset(s) cité(s) en dessous. */
export function pageDeNote(versets: { n: number; texte: string }[], reference: string, version: string): string {
  const nom = VERSIONS.find((x) => x.id === version)?.court ?? version;
  const corps = versets.map((x) => `<b>${x.n}</b> ${esc(x.texte)}`).join(' ');
  return `<h1><br></h1><p><br></p><blockquote>${corps}<br><i>${esc(reference)} · ${esc(nom)}</i></blockquote>`;
}
export function enregistrerNoteBiblique(html: string, g: Signature): boolean {
  const id = cahierBiblique();
  return !!(id && ajouterChapitre(id, html, g));
}
