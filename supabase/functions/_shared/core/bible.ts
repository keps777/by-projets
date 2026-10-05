// Livres de la Bible et saisie des passages lus (spec §8, Mode Focus).
export interface Livre { nom: string; abrev: string; chapitres: number }

const L = (nom: string, abrev: string, chapitres: number): Livre => ({ nom, abrev, chapitres });

export const LIVRES: Livre[] = [
  L('Genèse', 'Gn', 50), L('Exode', 'Ex', 40), L('Lévitique', 'Lv', 27), L('Nombres', 'Nb', 36), L('Deutéronome', 'Dt', 34),
  L('Josué', 'Jos', 24), L('Juges', 'Jg', 21), L('Ruth', 'Rt', 4), L('1 Samuel', '1 S', 31), L('2 Samuel', '2 S', 24),
  L('1 Rois', '1 R', 22), L('2 Rois', '2 R', 25), L('1 Chroniques', '1 Ch', 29), L('2 Chroniques', '2 Ch', 36),
  L('Esdras', 'Esd', 10), L('Néhémie', 'Né', 13), L('Esther', 'Est', 10), L('Job', 'Jb', 42), L('Psaumes', 'Ps', 150),
  L('Proverbes', 'Pr', 31), L('Ecclésiaste', 'Ec', 12), L('Cantique des cantiques', 'Ct', 8), L('Ésaïe', 'Es', 66),
  L('Jérémie', 'Jr', 52), L('Lamentations', 'Lm', 5), L('Ézéchiel', 'Ez', 48), L('Daniel', 'Dn', 12), L('Osée', 'Os', 14),
  L('Joël', 'Jl', 3), L('Amos', 'Am', 9), L('Abdias', 'Ab', 1), L('Jonas', 'Jon', 4), L('Michée', 'Mi', 7), L('Nahum', 'Na', 3),
  L('Habacuc', 'Ha', 3), L('Sophonie', 'So', 3), L('Aggée', 'Ag', 2), L('Zacharie', 'Za', 14), L('Malachie', 'Ml', 4),
  L('Matthieu', 'Mt', 28), L('Marc', 'Mc', 16), L('Luc', 'Lc', 24), L('Jean', 'Jn', 21), L('Actes', 'Ac', 28),
  L('Romains', 'Rm', 16), L('1 Corinthiens', '1 Co', 16), L('2 Corinthiens', '2 Co', 13), L('Galates', 'Ga', 6),
  L('Éphésiens', 'Ep', 6), L('Philippiens', 'Ph', 4), L('Colossiens', 'Col', 4), L('1 Thessaloniciens', '1 Th', 5),
  L('2 Thessaloniciens', '2 Th', 3), L('1 Timothée', '1 Tm', 6), L('2 Timothée', '2 Tm', 4), L('Tite', 'Tt', 3),
  L('Philémon', 'Phm', 1), L('Hébreux', 'He', 13), L('Jacques', 'Jc', 5), L('1 Pierre', '1 P', 5), L('2 Pierre', '2 P', 3),
  L('1 Jean', '1 Jn', 5), L('2 Jean', '2 Jn', 1), L('3 Jean', '3 Jn', 1), L('Jude', 'Jd', 1), L('Apocalypse', 'Ap', 22)
];

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const INDEX = new Map<string, Livre>();
for (const l of LIVRES) { INDEX.set(norm(l.nom), l); INDEX.set(norm(l.abrev), l); }

/** Retrouve un livre par son nom ou son abréviation, sans tenir compte des accents ni de la casse. */
export function trouverLivre(saisie: string): Livre | undefined {
  const n = norm(saisie);
  if (!n) return undefined;
  const exact = INDEX.get(n);
  if (exact) return exact;
  const debuts = LIVRES.filter((l) => norm(l.nom).startsWith(n));
  return debuts.length === 1 ? debuts[0] : undefined;
}

/** Livres proposés pendant la frappe. */
export function suggerer(saisie: string, max = 6): Livre[] {
  const n = norm(saisie);
  if (!n) return LIVRES.slice(0, max);
  return LIVRES.filter((l) => norm(l.nom).startsWith(n) || norm(l.abrev) === n).slice(0, max);
}

export interface Passage { livre: string; de: number; a: number }

export type ErreurPassage = 'livre_inconnu' | 'chapitre_invalide' | 'ordre_inverse';

/** Valide un passage saisi et retourne le passage normalisé (nom officiel du livre). */
export function validerPassage(livre: string, de: number, a: number): { ok: true; passage: Passage } | { ok: false; erreur: ErreurPassage } {
  const l = trouverLivre(livre);
  if (!l) return { ok: false, erreur: 'livre_inconnu' };
  if (!Number.isInteger(de) || !Number.isInteger(a) || de < 1 || a < 1 || de > l.chapitres || a > l.chapitres) return { ok: false, erreur: 'chapitre_invalide' };
  if (a < de) return { ok: false, erreur: 'ordre_inverse' };
  return { ok: true, passage: { livre: l.nom, de, a } };
}

export const chapitresDuPassage = (p: Passage) => p.a - p.de + 1;
export const compterChapitres = (ps: Passage[]) => ps.reduce((s, p) => s + chapitresDuPassage(p), 0);

/** « Matthieu 8–10 », « Luc 22 ». */
export function formaterPassage(p: Passage, abrege = false): string {
  const l = trouverLivre(p.livre);
  const nom = abrege && l ? l.abrev : p.livre;
  return p.de === p.a ? `${nom} ${p.de}` : `${nom} ${p.de}–${p.a}`;
}

export const formaterPassages = (ps: Passage[], abrege = false) => ps.map((p) => formaterPassage(p, abrege)).join(' · ');

/** Nombre de livres de l'Ancien Testament (les 39 premiers de LIVRES) ; les 27 suivants forment le Nouveau Testament. */
export const NB_LIVRES_AT = 39;

/**
 * Relit des références écrites à la main : « Matthieu 8–10 · Luc 22 », « Jn 3; Ps 23 ». Les morceaux qu'on ne comprend pas sont ignorés.
 * Sert à retrouver les passages d'une saisie qui n'en a gardé que le texte.
 */
export function lirePassages(texte: string): Passage[] {
  const res: Passage[] = [];
  for (const morceau of texte.split(/[·;,\n]/)) {
    const m = morceau.trim().match(/^(.+?)\s+(\d+)(?:\s*[–—-]\s*(\d+))?$/);
    if (!m) continue;
    const r = validerPassage(m[1], +m[2], m[3] ? +m[3] : +m[2]);
    if (r.ok) res.push(r.passage);
  }
  return res;
}
