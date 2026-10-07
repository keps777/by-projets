// Règles de progression mensuelle (spec §5). Fonctions pures.
import { ecartJours, joursDuMois, maxJour, minJour, dernierDuMois, premierDuMois, moisDe } from './dates.ts';
import { TYPES, agreger, valeursEntre } from './metriques.ts';
import type { Jour, Metrique, Mois, SousProjetPeriode, ValeurSaisie } from './types.ts';

export interface Fenetre { debut: Jour; fin: Jour; jours: number }

/** Période commune au sous-projet et au mois (bornes incluses), ou null s'ils ne se touchent pas. */
export function fenetreDuMois(sp: SousProjetPeriode, mois: Mois): Fenetre | null {
  const debut = maxJour(sp.debut, premierDuMois(mois));
  const fin = sp.fin ? minJour(sp.fin, dernierDuMois(mois)) : dernierDuMois(mois);
  if (debut > fin) return null;
  return { debut, fin, jours: ecartJours(debut, fin) + 1 };
}

export function joursTotaux(sp: SousProjetPeriode): number | null { return sp.fin ? ecartJours(sp.debut, sp.fin) + 1 : null; }

/** Règle de trois : ce qui est attendu pendant ce mois. */
export function cibleDuMois(m: Pick<Metrique, 'cible' | 'periode' | 'type'>, sp: SousProjetPeriode, mois: Mois): number | null {
  if (m.cible == null) return null;
  const f = fenetreDuMois(sp, mois);
  if (!f) return null;
  switch (m.periode) {
    case 'jour': return m.cible * f.jours;
    case 'semaine': return (m.cible * f.jours) / 7;
    case 'mois': return (m.cible * f.jours) / joursDuMois(mois);
    case 'total': {
      const t = joursTotaux(sp);
      return t == null ? null : (m.cible * f.jours) / t;
    }
  }
}

/** Jours écoulés dans la fenêtre, aujourd'hui compris. */
export function joursEcoules(f: Fenetre, aujourdhui: Jour): number {
  if (aujourdhui < f.debut) return 0;
  if (aujourdhui > f.fin) return f.jours;
  return ecartJours(f.debut, aujourdhui) + 1;
}

export type EtatProgression = 'a_definir' | 'a_venir' | 'en_cours' | 'termine';

export interface Progression {
  etat: EtatProgression;
  cible: number | null;
  realise: number | null;
  /** Valeur réelle (peut dépasser 1). */
  ratio: number | null;
  /** Pour la barre : entier de 0 à 100. */
  pct: number | null;
  /** Ce qui devrait être fait aujourd'hui (le trait sur la barre). */
  attendu: number | null;
  /** Position du trait en % de la barre. */
  traitPct: number | null;
  retard: number;
  /** Quantité par jour pour rattraper ce qui reste, sur les jours restants. */
  parJourPourRattraper: number | null;
  joursRestants: number;
}

const VIDE: Progression = { etat: 'a_definir', cible: null, realise: null, ratio: null, pct: null, attendu: null, traitPct: null, retard: 0, parJourPourRattraper: null, joursRestants: 0 };

export function progressionDuMois(
  m: Metrique, sp: SousProjetPeriode, valeurs: ValeurSaisie[], mois: Mois, aujourdhui: Jour
): Progression {
  const f = fenetreDuMois(sp, mois);
  if (!f) return { ...VIDE, etat: 'a_venir' };
  const cible = cibleDuMois(m, sp, mois);
  if (cible == null || cible === 0) return { ...VIDE, etat: 'a_definir' };

  const ecoules = joursEcoules(f, aujourdhui);
  const dansFenetre = valeursEntre(valeurs, m.cle, f.debut, f.fin);
  const agregation = TYPES[m.type].agregation;
  const restants = f.jours - ecoules;
  const etat: EtatProgression = ecoules === 0 ? 'a_venir' : ecoules >= f.jours ? 'termine' : 'en_cours';

  // Heure : part des jours où l'heure respecte la cible.
  if (m.type === 'heure') {
    const cibleHeure = m.cible!;
    const ok = dansFenetre.filter((v) => (m.sens === 'moins' ? v.valeur <= cibleHeure : v.valeur >= cibleHeure)).length;
    const ratio = ecoules > 0 ? ok / ecoules : 0;
    return { etat, cible: cibleHeure, realise: ok, ratio, pct: arrondiPct(ratio), attendu: null, traitPct: null, retard: 0, parJourPourRattraper: null, joursRestants: restants };
  }

  // Valeur d'état (poids, pourcentage) : avancement entre la valeur de départ et la cible.
  if (agregation === 'dernier') {
    const tri = [...dansFenetre].sort((a, b) => (a.jour < b.jour ? -1 : 1));
    const depart = tri[0]?.valeur;
    const actuel = agreger(m.type, dansFenetre);
    if (actuel == null || depart == null) return { ...VIDE, etat, cible: m.cible, realise: null };
    const cibleV = m.cible!;
    const total = cibleV - depart;
    const ratio = total === 0 ? 1 : (actuel - depart) / total;
    return { etat, cible: cibleV, realise: actuel, ratio, pct: arrondiPct(ratio), attendu: null, traitPct: null, retard: 0, parJourPourRattraper: null, joursRestants: restants };
  }

  const realise = agreger(m.type, dansFenetre) ?? 0;
  const ratio = realise / cible;
  const attendu = (cible * ecoules) / f.jours;
  const retard = Math.max(0, attendu - realise);
  const reste = Math.max(0, cible - realise);
  return {
    etat, cible, realise, ratio, pct: arrondiPct(ratio), attendu,
    traitPct: Math.round((ecoules / f.jours) * 100), retard,
    parJourPourRattraper: restants > 0 ? reste / restants : null,
    joursRestants: restants
  };
}

function arrondiPct(ratio: number): number { return Math.max(0, Math.min(100, Math.round(ratio * 100))); }

/** Moyenne simple des progressions disponibles (sous-projets d'un projet, projets d'une rubrique). */
export function moyennePct(pcts: (number | null | undefined)[]): number | null {
  const v = pcts.filter((x): x is number => typeof x === 'number');
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

/** Trouve la métrique pilote d'un sous-projet : celle désignée, sinon la première qui a un objectif. */
export function metriquePilote(metriques: Metrique[], piloteId: string | null): Metrique | undefined {
  return metriques.find((m) => m.id === piloteId) ?? metriques.find((m) => m.cible != null);
}

/**
 * Métriques qui pilotent ensemble la barre d'un sous-projet : celles désignées (`ids`), dans l'ordre des métriques ;
 * à défaut, la pilote seule (voir `metriquePilote`). La première est la pilote principale (textes détaillés, graphique).
 */
export function metriquesPilotes(metriques: Metrique[], ids: readonly string[] | null | undefined, piloteId: string | null): Metrique[] {
  const choisies = ids?.length ? metriques.filter((m) => ids.includes(m.id)) : [];
  if (choisies.length) return choisies;
  const seule = metriquePilote(metriques, piloteId);
  return seule ? [seule] : [];
}

/**
 * Progression d'un sous-projet piloté par une ou plusieurs métriques : la barre est la **moyenne** des progressions de ses pilotes
 * (celles qui ont un objectif) ; le reste (réalisé, cible, trait « où je devrais être », retard) vient de la pilote principale.
 */
export function progressionPilotes(pilotes: Metrique[], sp: SousProjetPeriode, valeurs: ValeurSaisie[], mois: Mois, aujourdhui: Jour): Progression {
  const toutes = pilotes.map((m) => progressionDuMois(m, sp, valeurs, mois, aujourdhui));
  const principale = toutes[0] ?? VIDE;
  const chiffrees = toutes.filter((p) => p.pct != null);
  if (chiffrees.length < 2) return principale.pct != null || !chiffrees[0] ? principale : { ...chiffrees[0] };
  const moyenne = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  return { ...(principale.pct != null ? principale : chiffrees[0]), pct: Math.round(moyenne(chiffrees.map((p) => p.pct!))), ratio: moyenne(chiffrees.map((p) => p.ratio ?? 0)) };
}

/** État d'un sous-projet à valider : la date de fin est passée, ou la cible « au total » est atteinte (spec §6). */
export function doitEtreValide(m: Metrique, sp: SousProjetPeriode, valeurs: ValeurSaisie[], aujourdhui: Jour): boolean {
  if (sp.fin && aujourdhui > sp.fin) return true;
  if (m.periode === 'total' && m.cible != null && TYPES[m.type].agregation === 'somme') {
    const total = agreger(m.type, valeursEntre(valeurs, m.cle, sp.debut, sp.fin ?? '9999-12-31')) ?? 0;
    return total >= m.cible;
  }
  return false;
}

export { moisDe };
