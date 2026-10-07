// Propositions de tâches pour un sous-projet dont l'objectif n'est pas rempli : aucune tâche ne l'alimente, ou le temps planifié par
// semaine n'atteint pas ce que l'objectif demande. Fonctions pures ; l'écran ouvre « Nouvelle tâche » prérempli.
import { joursDuMois } from '@core/dates.ts';
import { TYPES } from '@core/metriques.ts';
import { joursTotaux } from '@core/progression.ts';
import { dureeLisible } from '@core/units.ts';
import type { Mois, Metrique, SousProjetPeriode } from '@core/types.ts';
import type { Tache } from '@core/lignes.ts';

export interface PropositionTache {
  id: string;
  /** « Tous les jours », « Du lundi au vendredi », « 3 fois par semaine ». */
  quand: string;
  dureeMin: number;
  rec: 'quotidien' | 'hebdo';
  /** Jours de la semaine (0 = lundi) pour une tâche hebdomadaire. */
  jours: number[];
  /** Valeur prévue à chaque fois, par clé de métrique (pages, fois…). */
  prevus: Record<string, number>;
  /** Ce que la tâche apporte : « 45 min × 7 jours = 5 h 15 par semaine ». */
  detail: string;
}

export interface BesoinSousProjet {
  /** Minutes de temps à planifier par semaine pour atteindre l'objectif de temps (null : pas d'objectif de temps). */
  minutesParSemaine: number | null;
  /** Quantité par semaine des métriques de compte (pages, fois…), par clé. */
  comptesParSemaine: Record<string, { nom: string; unite: string; parSemaine: number; pas: number }>;
}

const FORMULES: { id: string; quand: string; rec: 'quotidien' | 'hebdo'; jours: number[] }[] = [
  { id: 'tous', quand: 'Tous les jours', rec: 'quotidien', jours: [0, 1, 2, 3, 4, 5, 6] },
  { id: 'semaine', quand: 'Du lundi au vendredi', rec: 'hebdo', jours: [0, 1, 2, 3, 4] },
  { id: 'trois', quand: '3 fois par semaine', rec: 'hebdo', jours: [0, 2, 4] }
];
const DUREE_PAR_DEFAUT = 45;
const DUREE_MIN = 10;
const DUREE_MAX = 6 * 60;

/** Combien l'objectif d'une métrique demande par semaine (unité de base), ou null s'il n'a pas de sens ici. */
export function parSemaine(m: Pick<Metrique, 'cible' | 'periode' | 'type'>, sp: SousProjetPeriode, mois: Mois): number | null {
  if (m.cible == null || m.cible <= 0 || TYPES[m.type].agregation !== 'somme') return null;
  switch (m.periode) {
    case 'jour': return m.cible * 7;
    case 'semaine': return m.cible;
    case 'mois': return (m.cible * 7) / joursDuMois(mois);
    case 'total': { const t = joursTotaux(sp); return t ? (m.cible * 7) / t : null; }
  }
}

export function besoinDuSousProjet(pilotesEtAutres: Metrique[], sp: SousProjetPeriode, mois: Mois): BesoinSousProjet {
  const besoin: BesoinSousProjet = { minutesParSemaine: null, comptesParSemaine: {} };
  for (const m of pilotesEtAutres) {
    const w = parSemaine(m, sp, mois);
    if (w == null) continue;
    if (m.type === 'temps') besoin.minutesParSemaine = (besoin.minutesParSemaine ?? 0) + w / 60;
    else if (m.type === 'nombre' || m.type === 'fois') besoin.comptesParSemaine[m.cle] = { nom: m.nom, unite: m.unite, parSemaine: w, pas: TYPES[m.type].pas || 1 };
  }
  return besoin;
}

/** Minutes planifiées par semaine par les tâches qui alimentent le sous-projet (hebdomadaires, quotidiennes, mensuelles ; pas les tâches uniques). */
export function minutesPlanifieesParSemaine(taches: Pick<Tache, 'duree_min' | 'regle'>[]): number {
  return taches.reduce((s, t) => {
    const r = t.regle;
    const fois = r.frequence === 'quotidien' ? 7 : r.frequence === 'hebdo' ? (r.jours?.length || 1) : r.frequence === 'mensuel' ? 7 / 30 : 0;
    return s + t.duree_min * fois;
  }, 0);
}

const arrondi5 = (n: number) => Math.max(5, Math.ceil(n / 5) * 5);
const dureeTexte = (min: number) => dureeLisible(min * 60).replace(/^0 /, '');

/**
 * Tâches à ajouter pour remplir l'objectif. `taches` : celles qui alimentent déjà le sous-projet. Vide quand l'objectif est déjà couvert
 * (ou qu'aucun objectif de temps ou de compte ne se traduit en tâches).
 */
export function proposerTaches(besoin: BesoinSousProjet, taches: Pick<Tache, 'duree_min' | 'regle'>[]): { manque: string | null; propositions: PropositionTache[] } {
  const comptes = Object.entries(besoin.comptesParSemaine);
  if (besoin.minutesParSemaine == null && !comptes.length) return { manque: null, propositions: [] };
  const planifie = minutesPlanifieesParSemaine(taches);
  const aucune = taches.length === 0;
  let aPlanifier: number | null = null;
  if (besoin.minutesParSemaine != null) {
    aPlanifier = besoin.minutesParSemaine - planifie;
    if (!aucune && aPlanifier <= besoin.minutesParSemaine * 0.05) return { manque: null, propositions: [] };
  } else if (!aucune) return { manque: null, propositions: [] };

  const manque = aucune
    ? 'Aucune tâche ne nourrit ce sous-projet.'
    : `Les tâches planifient ${dureeTexte(Math.round(planifie))} par semaine ; il en faut ${dureeTexte(Math.round(besoin.minutesParSemaine!))}.`;

  const propositions: PropositionTache[] = [];
  for (const f of FORMULES) {
    const fois = f.jours.length;
    const duree = aPlanifier != null && aPlanifier > 0 ? arrondi5(aPlanifier / fois) : DUREE_PAR_DEFAUT;
    if (duree < DUREE_MIN || duree > DUREE_MAX) continue;
    const prevus: Record<string, number> = {};
    const morceaux = [`${dureeTexte(duree)} × ${fois} jour${fois > 1 ? 's' : ''}${aPlanifier != null ? ` = ${dureeTexte(duree * fois)} par semaine` : ''}`];
    for (const [cle, c] of comptes) {
      const v = Math.max(c.pas, Math.ceil(c.parSemaine / fois / c.pas) * c.pas);
      prevus[cle] = v;
      morceaux.push(`${v} ${c.unite || c.nom.toLowerCase()} chaque fois`);
    }
    propositions.push({ id: f.id, quand: f.quand, dureeMin: duree, rec: f.rec, jours: f.jours, prevus, detail: morceaux.join(' · ') });
  }
  return { manque, propositions };
}

/** Lien « Nouvelle tâche » prérempli : projet, sous-projet nourri, titre, durée, récurrence, valeurs prévues. */
export function lienProposition(p: PropositionTache, projetId: string, sousProjetId: string, titre: string): string {
  const q = new URLSearchParams({ projet: projetId, sous_projet: sousProjetId, titre, duree: String(p.dureeMin), rec: p.rec });
  if (p.rec === 'hebdo') q.set('jours', p.jours.join(','));
  const prevus = Object.entries(p.prevus).map(([cle, v]) => `${cle}=${v}`).join(',');
  if (prevus) q.set('prevus', prevus);
  return `/tache/nouvelle?${q.toString()}`;
}
