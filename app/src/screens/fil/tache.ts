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
