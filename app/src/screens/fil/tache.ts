// Ajout d'une tâche (spec §7) : calculs purs du formulaire.
import { jourSemaine, JOURS_COURTS } from '@core/dates.ts';
import { TYPES } from '@core/metriques.ts';
import { libelleDelai } from '@core/rappels.ts';
import { decrire, rangDuJour, type Regle } from '@core/recurrence.ts';
import type { Jour, OptionChoix, PeriodeCible, TypeMetrique } from '@core/types.ts';
import { cap, dateLongue, hm } from './format.ts';

export type Recurrence = 'une_fois' | 'quotidien' | 'hebdo' | 'mensuel';
export type TypeFin = 'aucune' | 'date' | 'fois';

export interface MetriqueSource { cle: string; type: TypeMetrique; nom: string; unite: string; cible: number | null; periode_cible: PeriodeCible; options: OptionChoix[] | null }

export interface MesureForm {
  cle: string; type: TypeMetrique; nom: string; unite: string; options: OptionChoix[] | null;
  /** Noms des sous-projets qui lisent cette mesure. */
  alimente: string[];
  cible: number | null; periode: PeriodeCible | null;
}

/** Union des métriques des sous-projets activés, sans doublon de clé (la même saisie compte partout) ; le temps toujours présent, en dernier. */
export function unionMesures(sps: { nom: string; metriques: MetriqueSource[] }[]): MesureForm[] {
  const par = new Map<string, MesureForm>();
  for (const sp of sps) for (const m of sp.metriques) {
    const deja = par.get(m.cle);
    if (deja) { deja.alimente.push(sp.nom); continue; }
    par.set(m.cle, { cle: m.cle, type: m.type, nom: m.nom, unite: m.unite, options: m.options, alimente: [sp.nom], cible: m.cible, periode: m.periode_cible });
  }
  if (!par.has('temps')) par.set('temps', { cle: 'temps', type: 'temps', nom: 'Temps', unite: 'min', options: null, alimente: [], cible: null, periode: null });
  const l = [...par.values()];
  return [...l.filter((m) => m.type !== 'temps'), ...l.filter((m) => m.type === 'temps')];
}

/** Pas des boutons − et + dans le formulaire (unité de base). */
export const pasDe = (type: TypeMetrique) => (type === 'montant' ? 1000 : TYPES[type].pas);

/** Valeur prévue proposée par occurrence (unité de base), ou null si la mesure se saisit sans prévision. */
export function prevuParDefaut(m: Pick<MesureForm, 'type' | 'cible' | 'periode' | 'options'>, dureeMin: number, foisParSemaine: number): number | null {
  switch (m.type) {
    case 'temps': return dureeMin * 60;
    case 'reference': case 'poids': case 'pourcentage': case 'heure': case 'note': return null;
    case 'oui_non': return 1;
    case 'choix': return m.options?.[0]?.valeur ?? 1;
    case 'montant': return 0;
  }
  const pas = TYPES[m.type].pas || 1;
  if (m.cible == null) return pas;
  const brut = m.periode === 'jour' ? m.cible : m.periode === 'semaine' ? m.cible / Math.max(1, foisParSemaine) : m.periode === 'mois' ? m.cible / 30 : pas;
  return Math.max(pas, Math.round(brut / pas) * pas);
}

export interface Quand { debut: Jour; rec: Recurrence; jours: number[]; mensuel: 'jour_du_mois' | 'rang'; fin: TypeFin; finDate: Jour; finFois: number }

export function construireRegle(q: Quand): Regle {
  const fin: Regle['fin'] = q.rec === 'une_fois' || q.fin === 'aucune' ? { type: 'aucune' } : q.fin === 'date' ? { type: 'date', date: q.finDate } : { type: 'fois', fois: Math.max(1, q.finFois) };
  const regle: Regle = { frequence: q.rec, debut: q.debut, fin };
  if (q.rec === 'hebdo') regle.jours = [...new Set(q.jours.length ? q.jours : [jourSemaine(q.debut)])].sort((a, b) => a - b);
  if (q.rec === 'mensuel') regle.mensuel = q.mensuel === 'rang' ? { mode: 'rang', rang: Math.min(5, rangDuJour(q.debut)), jour: jourSemaine(q.debut) } : { mode: 'jour_du_mois', jour: +q.debut.slice(8) };
  return regle;
}

/** Lecture de la récurrence : « ce jour seulement (lundi 5 octobre) », « 3 fois par semaine (lun., mer., ven.) »… */
export function texteRecurrence(r: Regle): string {
  return r.frequence === 'une_fois' ? `ce jour seulement (${dateLongue(r.debut)})` : decrire(r);
}

/** « 2 fois par semaine · lun., jeu. » */
export function texteJours(jours: number[]): string {
  const j = [...new Set(jours)].sort((a, b) => a - b);
  return `${j.length} fois par semaine · ${j.map((x) => JOURS_COURTS[x]).join(', ')}`;
}

/** Libellés des deux façons de répéter chaque mois, à partir du jour de début. */
export function choixMensuels(debut: Jour): { valeur: 'jour_du_mois' | 'rang'; label: string }[] {
  const base: Quand = { debut, rec: 'mensuel', jours: [], mensuel: 'jour_du_mois', fin: 'aucune', finDate: debut, finFois: 1 };
  return [
    { valeur: 'jour_du_mois', label: cap(decrire(construireRegle(base))) },
    { valeur: 'rang', label: cap(decrire(construireRegle({ ...base, mensuel: 'rang' }))) }
  ];
}

export function resume(o: { titre: string; heure: number; duree: number; regle: Regle; nbSousProjets: number; avecProjet: boolean; rappel: number | null; rappelsAvant?: number[] }): string {
  const alim = !o.avecProjet ? 'sans projet' : o.nbSousProjets ? `alimente ${o.nbSousProjets} sous-projet${o.nbSousProjets > 1 ? 's' : ''}` : 'aucun sous-projet alimenté';
  const delais = [...(o.rappelsAvant ?? []), ...(o.rappel == null ? [] : [o.rappel])].sort((a, b) => b - a);
  const rap = !delais.length ? 'sans rappel' : `rappel${delais.length > 1 ? 's' : ''} ${delais.map((d) => (d === 0 ? 'à l’heure' : libelleDelai(d))).join(', ')}${delais.length === 1 && delais[0] === 0 ? '' : ' avant'}`;
  return `${o.titre.trim() || 'Tâche'} · ${hm(o.heure)}–${hm(o.heure + o.duree)} · ${texteRecurrence(o.regle)} · ${alim} · ${rap}`;
}

/** Heure proposée pour une nouvelle tâche : le prochain quart d'heure aujourd'hui, 9 h un autre jour. */
export function heureProposee(jour: Jour, aujourdhui: Jour, maintenantMin: number, duree: number): number {
  if (jour !== aujourdhui) return 9 * 60;
  return Math.min(1440 - duree, Math.ceil((maintenantMin + 1) / 15) * 15);
}

export const DUREE_MIN = 5;
export const DUREE_MAX = 24 * 60;

/**
 * Durée tapée à la main, en minutes : « 3h45 », « 3 h 45 », « 3:45 », « 4h », « 4 heures », « 225 », « 45 min », « 1,5 h ».
 * Un nombre seul vaut des minutes. Rend null si le texte n'est pas une durée, sinon une valeur bornée à 5 min – 24 h.
 */
export function lireDuree(texte: string): number | null {
  const t = texte.trim().toLowerCase().replace(',', '.').replace(/\s+/g, '');
  if (!t) return null;
  let min: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d+):(\d{1,2})$/))) min = +m[1] * 60 + +m[2];
  else if ((m = t.match(/^(\d+(?:\.\d+)?)(?:h|heures?)(\d{1,2})?(?:min|m)?$/))) min = Math.round(+m[1] * 60) + (m[2] ? +m[2] : 0);
  else if ((m = t.match(/^(\d+(?:\.\d+)?)(?:min|minutes?|m)?$/))) min = Math.round(+m[1]);
  if (min == null || !Number.isFinite(min)) return null;
  return Math.max(DUREE_MIN, Math.min(DUREE_MAX, min));
}

// ------------------------------------------------------------------ formulaire simplifié (spec §7, nov. 2026)

/** Un projet est « en cours » s'il est actif et a au moins un sous-projet en cours ou à valider (un projet encore sans sous-projet compte comme en cours). */
export function projetEnCours(statut: 'actif' | 'pause' | 'archive', statutsSousProjets: string[]): boolean {
  if (statut !== 'actif') return false;
  const vivants = statutsSousProjets.filter((s) => s !== 'archive');
  return !vivants.length || vivants.some((s) => s === 'en_cours' || s === 'a_valider');
}

/** Choix du menu « Répéter » : une seule liste au lieu de plusieurs rangées de boutons. */
export type Repetition = 'une_fois' | 'quotidien' | 'semaine' | 'weekend' | 'hebdo' | 'mensuel';
export const REPETITIONS: { valeur: Repetition; label: string }[] = [
  { valeur: 'une_fois', label: 'Une seule fois' }, { valeur: 'quotidien', label: 'Tous les jours' }, { valeur: 'semaine', label: 'Du lundi au vendredi' },
  { valeur: 'weekend', label: 'Le week-end' }, { valeur: 'hebdo', label: 'Chaque semaine (je choisis les jours)' }, { valeur: 'mensuel', label: 'Chaque mois' }
];
const SEMAINE = [0, 1, 2, 3, 4], WEEKEND = [5, 6];
const memes = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/** Le choix du menu qui correspond à la récurrence et aux jours du formulaire. */
export function repetitionDe(rec: Recurrence, jours: number[]): Repetition {
  if (rec === 'hebdo') return memes(jours, SEMAINE) ? 'semaine' : memes(jours, WEEKEND) ? 'weekend' : 'hebdo';
  return rec;
}

/** Récurrence et jours qu'un choix du menu impose (`joursActuels` : on garde ceux déjà choisis pour « Chaque semaine »). */
export function reglerRepetition(r: Repetition, jourDeDebut: number, joursActuels: number[]): { rec: Recurrence; jours: number[] } {
  if (r === 'semaine') return { rec: 'hebdo', jours: SEMAINE };
  if (r === 'weekend') return { rec: 'hebdo', jours: WEEKEND };
  if (r === 'hebdo') return { rec: 'hebdo', jours: joursActuels.length && !memes(joursActuels, SEMAINE) && !memes(joursActuels, WEEKEND) ? joursActuels : [jourDeDebut] };
  return { rec: r, jours: joursActuels };
}

/** Tous les délais de rappel proposés (minutes avant le début). */
export const DELAIS_RAPPEL = [0, 5, 10, 15, 30, 45, 60, 120, 180, 1440, 2880, 10080];

/** Tous les rappels d'une tâche, du plus proche au plus lointain, sans doublon. */
export function rappelsDe(rappel: number | null, avant: number[]): number[] {
  return [...new Set([rappel, ...avant].filter((d): d is number => typeof d === 'number' && d >= 0))].sort((a, b) => a - b);
}

/** Répartit une liste de délais : le plus proche du début devient le rappel principal (celui de l'alarme), les autres sont « plus tôt ». */
export function repartirRappels(delais: number[]): { rappel: number | null; rappelsAvant: number[] } {
  const l = rappelsDe(null, delais);
  return { rappel: l.length ? l[0] : null, rappelsAvant: l.slice(1) };
}

/** Durées proposées par le menu (minutes) ; la durée courante s'y ajoute si elle n'y est pas. */
export const DUREES_MENU = [5, 10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480];
export function optionsDuree(courante: number): number[] {
  return DUREES_MENU.includes(courante) ? DUREES_MENU : [...DUREES_MENU, courante].sort((a, b) => a - b);
}

/** Jours du menu « Quel jour ? » : aujourd'hui, demain, puis les jours suivants jusqu'à une semaine ; le jour choisi s'y ajoute s'il est plus loin. */
export function optionsJours(aujourdhui: Jour, courant: Jour, ajouter: (j: Jour, n: number) => Jour, nb = 8): Jour[] {
  const l = Array.from({ length: nb }, (_, i) => ajouter(aujourdhui, i));
  return courant && !l.includes(courant) ? [...l, courant].sort() : l;
}
