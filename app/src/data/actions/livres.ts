// Bibliothèque (spec §18, nov. 2026) : un livre = une note « couverture » (titre, couleur) + des notes « chapitre » qui portent son identifiant.
// Aucune colonne de plus : tout vit dans `notes` (`source_label` = `livre-couv:<id>` ou `livre:<id>`). Le journal du jour ne les montre pas.
import type { Note } from '@core/lignes.ts';
import { nouvelId } from '@core/ids.ts';
import { magasin } from '../magasin.svelte.ts';
import { ajouterNote, ajouterNoteRiche, modifierNote, modifierNoteRiche, supprimerNote, toutesLesNotes } from './notes.ts';

export const COULEURS_LIVRE = ['#B5452F', '#C9772B', '#C9A227', '#4E8F5A', '#1F7A6D', '#2F6DB5', '#4B4FB5', '#7B4BB5', '#B54B8A', '#6B5B4E', '#3A3F4B', '#111318'];
const COUV = 'livre-couv:', CHAP = 'livre:';

/** Signature d'un chapitre : circonstance (facultative), lieu (facultatif), date (au moins l'année). Rangée après `|` dans `source_label`. */
export interface Signature { c: string; l: string; d: string }
export const signatureDe = (n: Pick<Note, 'source_label'>): Signature | null => { const i = n.source_label?.indexOf('|') ?? -1; if (i < 0) return null; try { const j = JSON.parse(n.source_label!.slice(i + 1)); return { c: String(j.c ?? ''), l: String(j.l ?? ''), d: String(j.d ?? '') }; } catch { return null; } };
/** « Durant la nuit de prière de CMCI PAT, Montréal, 21/08/26 » : les parties vides sont sautées. */
export const texteSignature = (g: Signature): string => [g.c, g.l, g.d].map((x) => x.trim()).filter(Boolean).join(', ');
/** La date doit au moins donner l'année : « 2026 », « 08/2026 », « 21/08/26 », « 21 août 2026 ». */
export const dateValide = (t: string): boolean => /\b(19|20)\d{2}\b/.test(t) || /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2}\b/.test(t);
const CLES_HIST = { c: 'luther-life:sig-circonstances', l: 'luther-life:sig-lieux', d: 'luther-life:sig-dates' } as const;
/** Propositions passées (les plus récentes d'abord). */
export function historique(k: keyof Signature): string[] { try { const v = JSON.parse(localStorage.getItem(CLES_HIST[k]) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } }
export function retenir(g: Signature): void { for (const k of ['c', 'l', 'd'] as const) { const v = g[k].trim(); if (!v) continue; try { localStorage.setItem(CLES_HIST[k], JSON.stringify([v, ...historique(k).filter((x) => x !== v)].slice(0, 12))); } catch { /* ignoré */ } } }
/** Date du jour au format 21/08/26. */
export const dateDuJour = (): string => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`; };

/** Page = chapitre rangé sous un autre : l'identifiant du parent est la clé `p` de la partie JSON de `source_label`. */
export const parentDe = (n: Pick<Note, 'source_label'>): string | null => { const i = n.source_label?.indexOf('|') ?? -1; if (i < 0) return null; try { const p = JSON.parse(n.source_label!.slice(i + 1)).p; return typeof p === 'string' && p ? p : null; } catch { return null; } };
/** Un nœud de l'arborescence d'un livre : la note, sa profondeur (0 = chapitre) et son numéro « 2.1 ». */
export interface Noeud { note: Note; niveau: number; numero: string; parent: string | null; enfants: number }
/** Arborescence aplatie dans l'ordre de lecture (chapitre, puis ses pages, récursivement). Un parent introuvable rend la note orpheline : elle devient un chapitre. */
export function arbre(notes: Note[]): Noeud[] {
  const ids = new Set(notes.map((n) => n.id));
  const parent = (n: Note) => { const p = parentDe(n); return p && p !== n.id && ids.has(p) ? p : null; };
  const fils = new Map<string | null, Note[]>();
  for (const n of notes) fils.set(parent(n), [...(fils.get(parent(n)) ?? []), n]);
  const sortie: Noeud[] = []; const vus = new Set<string>();
  const parcourir = (pere: string | null, niveau: number, prefixe: string) => (fils.get(pere) ?? []).forEach((n, i) => {
    if (vus.has(n.id)) return; vus.add(n.id);
    const numero = prefixe ? `${prefixe}.${i + 1}` : String(i + 1);
    sortie.push({ note: n, niveau, numero, parent: pere, enfants: (fils.get(n.id) ?? []).length });
    parcourir(n.id, niveau + 1, numero);
  });
  parcourir(null, 0, '');
  return sortie;
}
/** Voisin de même parent (pour monter / descendre une page sans quitter son chapitre). */
export const voisin = (a: Noeud[], i: number, sens: -1 | 1): Note | undefined => { for (let k = i + sens; k >= 0 && k < a.length; k += sens) { if (a[k].niveau < a[i].niveau) return undefined; if (a[k].niveau === a[i].niveau && a[k].parent === a[i].parent) return a[k].note; } return undefined; };

export interface Livre { id: string; titre: string; couleur: string; /** Thème de classement (vide : sans thème). */ theme: string; note: Note; chapitres: Note[]; /** Arborescence (chapitres et pages) dans l'ordre de lecture. */ arbre: Noeud[]; /** Nombre de chapitres de premier niveau. */ nbChapitres: number; mots: number; pages: number }
export const estDeLivre = (n: Pick<Note, 'source_label'>): boolean => !!n.source_label && (n.source_label.startsWith(COUV) || n.source_label.startsWith(CHAP));

export const compterMots = (t: string): number => (t.match(/[\p{L}\p{N}’'-]+/gu) ?? []).length;
/** Une « page » de livre : environ 250 mots. */
export const pagesDe = (mots: number): number => (mots ? Math.max(1, Math.ceil(mots / 250)) : 0);
/** Titre d'un chapitre : sa première ligne (un titre de la note riche, sinon le début du texte). */
export const titreChapitre = (n: Pick<Note, 'texte'>): string => (n.texte.split('\n').find((l) => l.trim() && !/^\[(Image|Vidéo)\]$/.test(l.trim())) ?? 'Sans titre').replace(/^[•\d.\s]+/, '').slice(0, 80);

function lireCouverture(n: Note): { titre: string; couleur: string; theme: string } {
  try { const j = JSON.parse(n.texte); return { theme: String(j.theme ?? '').trim(), titre: String(j.titre || 'Sans titre'), couleur: COULEURS_LIVRE.includes(j.couleur) || /^#[0-9a-f]{6}$/i.test(j.couleur) ? j.couleur : COULEURS_LIVRE[0] }; } catch { return { titre: 'Sans titre', couleur: COULEURS_LIVRE[0], theme: '' }; }
}

export function livres(): Livre[] {
  const toutes = toutesLesNotes();
  return toutes.filter((n) => n.source_label?.startsWith(COUV)).map((note) => {
    const id = note.source_label!.slice(COUV.length);
    const chapitres = toutes.filter((n) => n.source_label === CHAP + id || n.source_label?.startsWith(CHAP + id + '|'));
    const mots = chapitres.reduce((t, c) => t + compterMots(c.texte), 0);
    const ab = arbre(chapitres);
    return { id, ...lireCouverture(note), note, chapitres, arbre: ab, nbChapitres: ab.filter((x) => x.niveau === 0).length, mots, pages: pagesDe(mots) };
  });
}

export function creerLivre(titre: string, couleur: string, theme = ''): string | undefined {
  const t = titre.trim();
  if (!t) return undefined;
  const id = nouvelId();
  ajouterNote({ texte: JSON.stringify({ titre: t, couleur, theme: theme.trim() }), origine: 'libre', sourceLabel: COUV + id });
  return id;
}
export function modifierLivre(l: Livre, titre: string, couleur: string, theme = l.theme): void { if (titre.trim()) modifierNote(l.note.id, JSON.stringify({ titre: titre.trim(), couleur, theme: theme.trim() })); }

/** Thèmes existants (ordre alphabétique) et livres rangés par thème (« Sans thème » en dernier). */
export const themesDe = (ls: Livre[]): string[] => [...new Set(ls.map((l) => l.theme).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
export function parTheme(ls: Livre[]): { theme: string; livres: Livre[] }[] {
  const g = themesDe(ls).map((t) => ({ theme: t, livres: ls.filter((l) => l.theme === t) }));
  const sans = ls.filter((l) => !l.theme);
  return sans.length ? [...g, { theme: '', livres: sans }] : g;
}
export function supprimerLivre(l: Livre): void { for (const c of l.chapitres) supprimerNote(c.id); supprimerNote(l.note.id); }
const etiquette = (livreId: string, g: Signature | null, parent: string | null = null) => CHAP + livreId + (g || parent ? `|${JSON.stringify({ ...(g ?? { c: '', l: '', d: '' }), ...(parent ? { p: parent } : {}) })}` : '');
export function ajouterChapitre(livreId: string, html: string, g: Signature | null = null, parent: string | null = null): Note | undefined { return ajouterNoteRiche(html, { origine: 'libre', sourceLabel: etiquette(livreId, g, parent) }); }
export function modifierChapitre(livreId: string, n: Note, html: string, g: Signature | null): void { modifierNoteRiche(n.id, html); magasin.ecrire('notes', { id: n.id, source_label: etiquette(livreId, g, parentDe(n)) }); }
/** Remet les chapitres dans un autre ordre : les numéros sont échangés (le livre se lit dans l'ordre des numéros). */
export function echangerChapitres(a: Note, b: Note): void { magasin.ecrire('notes', { id: a.id, numero: b.numero }); magasin.ecrire('notes', { id: b.id, numero: a.numero }); }

/** Supprime un chapitre ou une page ; ses pages remontent d'un niveau (chez le parent du supprimé). */
export function supprimerChapitre(livreId: string, n: Note, tout: Note[]): void {
  const pere = parentDe(n);
  for (const e of tout) if (parentDe(e) === n.id) magasin.ecrire('notes', { id: e.id, source_label: etiquette(livreId, signatureDe(e), pere) });
  supprimerNote(n.id);
}
