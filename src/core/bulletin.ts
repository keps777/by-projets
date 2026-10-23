// Bulletin de notes : lecture des notes saisies, moyennes par matière, moyenne générale et rang. Fonctions pures.
import { mentionNote, moyenne } from './ecole.ts';

export type NoteLue = { etat: 'vide' } | { etat: 'ok'; valeur: number } | { etat: 'invalide' };
/** Lit une note saisie sur 20 (« 11,5 », « 14 ») : vide, valide (0 à 20) ou invalide. */
export function lireNote(texte: string | undefined): NoteLue {
  const t = (texte ?? '').trim().replace(',', '.');
  if (t === '') return { etat: 'vide' };
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return { etat: 'invalide' };
  const n = Number(t);
  return n >= 0 && n <= 20 ? { etat: 'ok', valeur: n } : { etat: 'invalide' };
}
/** Appréciation d'une note saisie (vide pour une note absente, « Note invalide » si hors de 0 à 20). */
export function appreciation(texte: string | undefined): string {
  const n = lireNote(texte);
  return n.etat === 'vide' ? '' : n.etat === 'invalide' ? 'Note invalide' : mentionNote(n.valeur);
}
export const noteFr = (n: number) => n.toFixed(1).replace('.', ',');

export interface EvalMin { matiere: string; intitule: string; notes: Record<string, string>; publie: boolean }
export interface LigneMatiere { matiere: string; moyenne: number; moyenneClasse: number; details: { intitule: string; note: number }[] }
export interface Synthese { matieres: LigneMatiere[]; moyenne: number | null; rang: number | null; effectif: number }

const valeurs = (e: EvalMin, eleve: string) => { const n = lireNote(e.notes[eleve]); return n.etat === 'ok' ? n.valeur : null; };

/** Matières d'un élève : seules les évaluations publiées comptent. Moyenne de classe = moyenne de toutes les notes publiées de la matière. */
function matieresDe(evals: EvalMin[], eleve: string): LigneMatiere[] {
  const pub = evals.filter((e) => e.publie);
  const noms = [...new Set(pub.map((e) => e.matiere))];
  const res: LigneMatiere[] = [];
  for (const matiere of noms) {
    const es = pub.filter((e) => e.matiere === matiere);
    const details = es.flatMap((e) => { const v = valeurs(e, eleve); return v === null ? [] : [{ intitule: e.intitule, note: v }]; });
    if (!details.length) continue;
    const toutes = es.flatMap((e) => Object.keys(e.notes).flatMap((nom) => { const v = valeurs(e, nom); return v === null ? [] : [v]; }));
    res.push({ matiere, moyenne: moyenne(details.map((d) => d.note)), moyenneClasse: moyenne(toutes), details });
  }
  return res;
}
/** Bulletin d'un élève parmi `roster` (rang à égalité : même rang). */
export function synthese(evals: EvalMin[], eleve: string, roster: string[]): Synthese {
  const matieres = matieresDe(evals, eleve);
  const moy = matieres.length ? moyenne(matieres.map((m) => m.moyenne)) : null;
  const moyennes = roster.flatMap((nom) => { const ms = matieresDe(evals, nom); return ms.length ? [moyenne(ms.map((m) => m.moyenne))] : []; });
  const rang = moy === null ? null : 1 + moyennes.filter((x) => x > moy + 1e-9).length;
  return { matieres, moyenne: moy, rang, effectif: Math.max(roster.length, 1) };
}
