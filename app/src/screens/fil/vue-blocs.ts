// Lectures et gestes propres au Fil, construits sur la couche de données (magasin, requêtes, actions des blocs).
import { moyennePct } from '@core/progression.ts';
import { TYPES } from '@core/metriques.ts';
import { nombre } from '@core/units.ts';
import type { Jour, Mois, OptionChoix, TypeMetrique } from '@core/types.ts';
import { CLE_LIVRE, type MetriqueLigne, type Occurrence, type SousProjetLigne } from '@core/lignes.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { metriquesDe, progressionProjet, progressionSousProjet, type BlocVue } from '../../data/requetes.ts';
import { attendusDe, ecouleOccurrence, lancerBloc, pauseBloc, reprendreBloc, valeurSaisie } from '../../data/actions/blocs.ts';
import { formatValeur, libelleCle } from './format.ts';
import { versAffichage } from './saisie.ts';

/** Pixels par minute dans la journée de 24 h (72 px par heure, comme la maquette). */
export const PX = 72 / 60;

/** Code du point de rapport lié au projet (ex. « BR »), s'il existe. */
export function codeDuProjet(projetId: string | null | undefined): string | null {
  if (!projetId) return null;
  return magasin.lignes.points_rapport.find((p) => p.projet_id === projetId && p.actif)?.code ?? null;
}

export interface ProgressionAffichee { sp: SousProjetLigne; pct: number; trait: number | null; texte: string }

/** « 23 chapitres sur 217 », « 36 h sur 62 h », « 62 rencontres sur 93 ». */
export function texteProgression(type: TypeMetrique, unite: string, nom: string, realise: number, cible: number): string {
  if (type === 'fois' || type === 'nombre') {
    const u = unite || nom.toLowerCase();
    return `${nombre(realise)}${u ? ' ' + u : ''} sur ${nombre(cible)}`;
  }
  return `${formatValeur(type, realise, unite)} sur ${formatValeur(type, cible, unite)}`;
}

export function progressionsDe(sps: SousProjetLigne[], mois: Mois, aujourdhui: Jour): ProgressionAffichee[] {
  return sps.map((sp) => {
    const { pilote, progression: p } = progressionSousProjet(sp, mois, aujourdhui);
    const texte = pilote && p?.cible != null && p.realise != null ? texteProgression(pilote.type, pilote.unite, pilote.nom, p.realise, p.cible) : 'Objectif à définir';
    return { sp, pct: p?.pct ?? 0, trait: p?.traitPct ?? null, texte };
  });
}

/** Progression du mois affichée sur un bloc : moyenne de ses sous-projets alimentés, sinon celle du projet. */
export function pctDuBloc(b: BlocVue, mois: Mois, aujourdhui: Jour): number | null {
  if (!b.projet) return null;
  if (b.sousProjets.length) return moyennePct(b.sousProjets.map((sp) => progressionSousProjet(sp, mois, aujourdhui).progression?.pct));
  return progressionProjet(b.projet.id, mois, aujourdhui);
}

export interface MesureBloc {
  cle: string;
  type: TypeMetrique;
  label: string;
  unite: string;
  options: OptionChoix[] | null;
  /** Valeur prévue (unité de base), ou null. */
  prevu: number | null;
  /** Valeur enregistrée (unité de base). */
  realise: number;
  texte: string | null;
  pas: number;
}

const ORDRE_TYPE = (t: TypeMetrique) => (t === 'temps' ? 2 : t === 'reference' ? 1 : 0);

/** Métriques d'un bloc pour le volet : valeurs prévues de la tâche et métriques des sous-projets alimentés, sans doublon ; le temps en dernier. */
/** « Pages · titre du livre » pour une clé de livre, sinon le libellé par défaut de la clé. */
function libelleDeCle(cle: string): string {
  if (!cle.startsWith(CLE_LIVRE)) return libelleCle(cle);
  const id = cle.slice(CLE_LIVRE.length);
  const titre = magasin.lignes.points_rapport.flatMap((p) => p.livres ?? []).find((l) => l.id === id)?.titre;
  return titre ? `Pages · ${titre}` : 'Pages du livre';
}

export function mesuresDuBloc(b: BlocVue, now?: number): MesureBloc[] {
  const metriques = new Map<string, MetriqueLigne>();
  for (const sp of b.sousProjets) for (const m of metriquesDe(sp.id)) if (!metriques.has(m.cle)) metriques.set(m.cle, m);
  const attendus = new Map(attendusDe(b.tache.id).map((a) => [a.cle, a.valeur_prevue]));
  const cles = [...new Set([...attendus.keys(), ...metriques.keys(), 'temps'])];
  const saisie = b.saisie;
  const valeurs = saisie ? magasin.lignes.saisie_valeurs.filter((v) => v.saisie_id === saisie.id) : [];
  const res = cles.map((cle): MesureBloc => {
    const m = metriques.get(cle);
    const brut = (m?.type ?? cle.split(':')[0]) as TypeMetrique;
    const type: TypeMetrique = brut in TYPES ? brut : 'nombre';
    const v = valeurs.find((x) => x.cle === cle);
    let realise = v?.valeur_num ?? 0;
    if (cle === 'temps' && (b.enCours || b.enPause)) realise = ecouleOccurrence(b.occ, now);
    const prevu = attendus.get(cle) ?? (cle === 'temps' ? b.tache.duree_min * 60 : null);
    return {
      cle, type, label: cle === 'temps' ? 'Temps passé' : m?.nom ?? libelleDeCle(cle), unite: m?.unite ?? (cle.startsWith(CLE_LIVRE) ? 'p' : cle.includes(':') ? cle.split(':')[1] : ''),
      options: m?.options ?? null, prevu, realise, texte: v?.valeur_txt ?? null, pas: TYPES[type].pas || 1
    };
  });
  return res.sort((a, z) => ORDRE_TYPE(a.type) - ORDRE_TYPE(z.type));
}

/** Occurrences dont le minuteur tourne ou est en pause, celles qui tournent d'abord (plusieurs blocs peuvent tourner en même temps). */
export function occurrencesActives(): Occurrence[] {
  const o = magasin.lignes.occurrences.filter((x) => x.etat === 'en_cours' || x.etat === 'pause');
  return o.sort((a, z) => (a.etat === z.etat ? Date.parse(a.debut) - Date.parse(z.debut) : a.etat === 'en_cours' ? -1 : 1));
}

/** La première occurrence active (celle qui tourne, sinon en pause). */
export function occurrenceActive(): Occurrence | undefined { return occurrencesActives()[0]; }

/** ▶ / ⏸ : chaque bloc a son minuteur, plusieurs peuvent tourner en même temps (spec §8). */
export function basculerMinuteur(occId: string): void {
  const o = magasin.trouver('occurrences', occId);
  if (!o) return;
  if (o.etat === 'en_cours') pauseBloc(occId);
  else if (o.etat === 'pause') reprendreBloc(occId);
  else lancerBloc(occId);
}

/** Temps réalisé d'un bloc (en direct s'il tourne). */
export function tempsDuBloc(b: BlocVue, now?: number): number {
  if (b.enCours || b.enPause) return ecouleOccurrence(b.occ, now);
  return valeurSaisie(b.occ.id, 'temps') ?? 0;
}

/** Étiquette du réalisé affichée à droite d'un bloc fait : « 3/7 ch. » ou « 52 min ». */
export function etiquetteRealise(b: BlocVue): string {
  const qte = mesuresDuBloc(b).find((m) => m.type !== 'temps' && m.type !== 'reference' && m.prevu != null);
  if (qte) {
    const n = (v: number) => nombre(versAffichage(qte.type, v));
    return `${n(qte.realise)}/${n(qte.prevu!)}${qte.unite ? ' ' + abreger(qte.unite) : ''}`;
  }
  return formatValeur('temps', valeurSaisie(b.occ.id, 'temps') ?? (b.finMin - b.debutMin) * 60);
}

const ABR: Record<string, string> = { chapitres: 'ch.', pages: 'p.', personnes: 'pers.', minutes: 'min' };
export const abreger = (u: string) => ABR[u] ?? u;

export interface StatsJour { faits: number; total: number; pct: number; servies: number; segments: { couleur: string; pct: number }[] }

/** Faits / prévus d'une journée et part de chaque rubrique dans ce qui est fait. */
export function statsJour(blocs: BlocVue[]): StatsJour {
  const faits = blocs.filter((b) => b.fait);
  const parCouleur = new Map<string, number>();
  for (const b of faits) if (b.rubrique) parCouleur.set(b.couleur, (parCouleur.get(b.couleur) ?? 0) + 1);
  const total = blocs.length;
  return {
    faits: faits.length, total, pct: total ? Math.round((faits.length / total) * 100) : 0, servies: parCouleur.size,
    segments: [...parCouleur].map(([couleur, n]) => ({ couleur, pct: (n / total) * 100 }))
  };
}
