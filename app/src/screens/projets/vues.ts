// Logique d'affichage des écrans Projets (fonctions pures, testées dans vues.test.ts).
// Les calculs de fond (progression, agrégation, unités) viennent du noyau ; ici, on ne fait que les mettre en forme.
import { ajouterJours, dernierDuMois, joursDuMois, lundiDe, premierDuMois } from '@core/dates.ts';
import { TYPES, agreger, cleMetrique, valeursEntre } from '@core/metriques.ts';
import { dureeLisible, formatDistance, formatHeure, formatMontantCourt, formatPoids, nombre, parseHeure } from '@core/units.ts';
import type { Jour, Metrique, PeriodeCible, TypeMetrique, ValeurSaisie } from '@core/types.ts';

// ------------------------------------------------------------------ dates

export const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const numJour = (j: Jour) => +j.slice(8, 10);
const numMois = (j: Jour) => +j.slice(5, 7) - 1;
export const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** « 1er oct. », « 5 oct. » */
export function jourCourt(j: Jour): string { const d = numJour(j); return `${d === 1 ? '1er' : d} ${MOIS_COURTS[numMois(j)]}`; }
/** « 05/10 » */
export const jourChiffres = (j: Jour) => `${j.slice(8, 10)}/${j.slice(5, 7)}`;
/** « Octobre » pour « 2026-10 » */
export const nomMois = (mois: string) => majuscule(MOIS_LONGS[+mois.slice(5, 7) - 1]);

/** « 1er – 31 octobre 2026 », « 15 oct. – 23 nov. 2026 », « depuis le 3 oct. 2026 » */
export function periodeTexte(debut: Jour, fin: Jour | null): string {
  if (!fin) return `depuis le ${jourCourt(debut)} ${debut.slice(0, 4)}`;
  if (debut.slice(0, 7) === fin.slice(0, 7)) {
    const d = numJour(debut);
    return `${d === 1 ? '1er' : d} – ${numJour(fin)} ${MOIS_LONGS[numMois(fin)]} ${fin.slice(0, 4)}`;
  }
  const memeAnnee = debut.slice(0, 4) === fin.slice(0, 4);
  return `${jourCourt(debut)}${memeAnnee ? '' : ' ' + debut.slice(0, 4)} – ${jourCourt(fin)} ${fin.slice(0, 4)}`;
}

/** Jours de `debut` à `fin` inclus, du plus récent au plus ancien. */
export function joursDecroissants(debut: Jour, fin: Jour): Jour[] {
  const res: Jour[] = [];
  for (let j = fin; j >= debut; j = ajouterJours(j, -1)) res.push(j);
  return res;
}

// ------------------------------------------------------------------ valeurs et unités

const ABREV: Record<string, string> = { chapitres: 'ch.', pages: 'p.', versets: 'v.', personnes: 'pers.' };
export const uniteCourte = (u: string) => ABREV[u] ?? u;

/** Valeur (unité de base) → texte lisible, avec son unité. */
export function valeurTexte(m: Pick<Metrique, 'type' | 'unite' | 'options'>, v: number | null | undefined, court = false): string {
  if (v == null) return '—';
  switch (m.type) {
    case 'temps': return dureeLisible(v);
    case 'montant': return formatMontantCourt(Math.round(v));
    case 'distance': return formatDistance(v);
    case 'poids': return formatPoids(v);
    case 'note': return `${nombre(v)}/10`;
    case 'pourcentage': return `${nombre(v)} %`;
    case 'heure': return formatHeure(v);
    case 'choix': return `${nombre(v)} j`;
    case 'oui_non': case 'fois': return nombre(v);
    case 'nombre': { const u = court ? uniteCourte(m.unite) : m.unite; return u && u !== 'unités' ? `${nombre(v)} ${u}` : nombre(v); }
    case 'reference': return '';
  }
}

/** « 23 / 217 ch. », « 2 h 30 / 22 h 30 », « 300 $ / 600 $ » */
export function realiseSurCible(m: Pick<Metrique, 'type' | 'unite' | 'options'>, realise: number | null, cible: number | null): string {
  if (cible == null) return realise == null ? '' : valeurTexte(m, realise, true);
  if (m.type === 'nombre') return `${nombre(realise ?? 0)} / ${valeurTexte(m, cible, true)}`;
  if (m.type === 'fois' || m.type === 'oui_non') return `${nombre(realise ?? 0)} / ${nombre(cible)}`;
  if (m.type === 'choix') return `${nombre(realise ?? 0)} / ${nombre(cible)} j`;
  return `${valeurTexte(m, realise ?? 0, true)} / ${valeurTexte(m, cible, true)}`;
}

/** Résumé d'une progression du mois. Pour une Heure, le noyau compte les jours à l'heure : « 3 j à l'heure ». */
export function resumeProgression(m: Pick<Metrique, 'type' | 'unite' | 'options'>, p: { realise: number | null; cible: number | null }): string {
  if (m.type === 'heure') return `${nombre(p.realise ?? 0)} j à l’heure`;
  return realiseSurCible(m, p.realise, p.cible);
}

export const PERIODES: { valeur: PeriodeCible; label: string; texte: string }[] = [
  { valeur: 'jour', label: 'par jour', texte: 'par jour' },
  { valeur: 'semaine', label: 'par sem.', texte: 'par semaine' },
  { valeur: 'mois', label: 'par mois', texte: 'par mois' },
  { valeur: 'total', label: 'au total', texte: 'au total' }
];

/** « Objectif : 7 ch. par jour », « Objectif : avant 05:00 », « Référence libre » */
export function objectifTexte(m: Pick<Metrique, 'type' | 'unite' | 'options' | 'cible' | 'periode' | 'sens'>): string {
  if (m.type === 'reference') return 'Référence libre';
  if (m.cible == null) return 'Objectif à définir';
  if (m.type === 'heure') return `Objectif : ${m.sens === 'moins' ? 'avant' : 'après'} ${formatHeure(m.cible)}`;
  const per = PERIODES.find((p) => p.valeur === m.periode)?.texte ?? '';
  return `Objectif : ${valeurTexte(m, m.cible, true)} ${per}${m.sens === 'moins' ? ' au plus' : ''}`;
}

/** Valeur de l'unité de base → valeur saisie à l'écran (minutes, dollars, km, kg). */
export function versAffichage(type: TypeMetrique, base: number): number {
  switch (type) {
    case 'temps': return base / 60;
    case 'montant': return base / 100;
    case 'distance': case 'poids': return base / 1000;
    default: return base;
  }
}
/** Valeur saisie à l'écran → unité de base, arrondie à l'entier quand l'unité de base est entière. */
export function versBase(type: TypeMetrique, affiche: number): number {
  switch (type) {
    case 'temps': return Math.round(affiche * 60);
    case 'montant': return Math.round(affiche * 100);
    case 'distance': case 'poids': return Math.round(affiche * 1000);
    case 'fois': case 'oui_non': case 'heure': return Math.round(affiche);
    case 'note': return Math.max(0, Math.min(10, Math.round(affiche)));
    case 'pourcentage': return Math.max(0, Math.min(100, affiche));
    default: return affiche;
  }
}

/** Pas des boutons − et + (unité de base). Les gros montants avancent de 100 $. */
export function pasDe(type: TypeMetrique, base: number | null): number {
  if (type === 'montant' && (base ?? 0) >= 100000) return 10000;
  return TYPES[type].pas;
}

/** Texte d'un champ d'objectif : « 45 », « 3,5 », « 05:00 ». */
export function champTexte(type: TypeMetrique, base: number | null): string {
  if (base == null) return '';
  if (type === 'heure') return formatHeure(base);
  return String(Math.round(versAffichage(type, base) * 100) / 100).replace('.', ',');
}
/** Lecture d'un champ : null si vide ou illisible. */
export function lireChamp(type: TypeMetrique, texte: string): number | null {
  const t = texte.trim();
  if (!t) return null;
  if (type === 'heure') return parseHeure(t);
  const n = Number(t.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? versBase(type, Math.max(0, n)) : null;
}

/** Valeur par défaut d'une métrique ajoutée à la main (unité de base). */
export function cibleParDefaut(type: TypeMetrique): number | null {
  switch (type) {
    case 'temps': return 1800;
    case 'montant': return 10000;
    case 'heure': return 300;
    case 'pourcentage': return 100;
    case 'distance': return 5000;
    case 'poids': return 75000;
    case 'note': return 8;
    case 'reference': return null;
    default: return 1;
  }
}

// ------------------------------------------------------------------ métriques à créer

export interface Brouillon {
  type: TypeMetrique; nom: string; unite: string; cible: number | null; periode_cible: PeriodeCible;
  sens: 'plus' | 'moins'; options?: { label: string; valeur: number }[] | null; dans_rapport: boolean; cle?: string;
  /** Fait partie des métriques qui pilotent ensemble la barre (nouveau sous-projet). */
  pilote?: boolean;
}

export const cleDe = (m: Brouillon) => m.cle ?? cleMetrique(m.type, m.unite, m.nom);

/** Problèmes qui empêchent d'enregistrer : clés en double (la base les refuse), objectif « au total » sans date de fin. */
export function problemesMetriques(ms: Brouillon[], fin: Jour | null): string[] {
  const res: string[] = [];
  const vues = new Map<string, string>();
  for (const m of ms) {
    const cle = cleDe(m);
    const deja = vues.get(cle);
    if (deja != null) res.push(`« ${deja} » et « ${m.nom} » liraient la même saisie : change le nom ou l’unité de l’une des deux.`);
    else vues.set(cle, m.nom);
    if (!fin && m.periode_cible === 'total' && m.cible != null) res.push(`« ${m.nom} » vise un total : choisis une date de fin.`);
  }
  return res;
}

/** Calculs automatiques proposés selon les métriques présentes (catalogue fermé de la spec §4). */
export function calculsProposes(ms: Pick<Brouillon, 'type' | 'nom' | 'unite' | 'cible' | 'sens'>[]): string[] {
  const res: string[] = [];
  const a = (t: TypeMetrique) => ms.find((m) => m.type === t);
  const montants = ms.filter((m) => m.type === 'montant');
  const entrees = montants.find((m) => /entr/i.test(m.nom));
  const sorties = montants.find((m) => /sorti|d[ée]pens|achat/i.test(m.nom)) ?? montants.find((m) => m.sens === 'moins');
  const epargne = montants.find((m) => /[ée]pargn/i.test(m.nom));
  if (entrees && sorties) res.push('Solde = Entrées − Sorties');
  if (sorties?.cible != null) res.push(`Reste du budget = ${formatMontantCourt(sorties.cible)} − ${sorties.nom}`);
  if (entrees && epargne) res.push('Taux d’épargne = Épargne ÷ Entrées');
  if (epargne && epargne.cible != null && !entrees) res.push('Reste à épargner = objectif − épargné');
  if (a('temps') && a('fois')) res.push(`Durée moyenne = ${a('temps')!.nom} ÷ ${a('fois')!.nom}`);
  if (a('temps') && a('distance')) res.push(`Allure = ${a('temps')!.nom} ÷ ${a('distance')!.nom}`);
  const pers = ms.find((m) => m.type === 'nombre' && /personne/i.test(m.unite + m.nom));
  if (pers && a('temps')) res.push(`Personnes par heure = ${pers.nom} ÷ ${a('temps')!.nom}`);
  const ca = montants.find((m) => /affaire|vente/i.test(m.nom));
  if (ca && a('temps')) res.push(`Chiffre d’affaires par heure = ${ca.nom} ÷ ${a('temps')!.nom}`);
  if (a('heure')?.cible != null) res.push(`Écart à la cible = ${a('heure')!.nom} − ${formatHeure(a('heure')!.cible!)}`);
  if (a('choix')) res.push('Jours = complets + 0,5 × partiels');
  const cumul = ms.find((m) => (m.type === 'nombre' || m.type === 'fois') && m.cible != null);
  if (cumul) res.push(`Rythme = ${cumul.nom} ÷ jours écoulés`);
  return res;
}

// ------------------------------------------------------------------ période d'un nouveau sous-projet

export type ChoixPeriode = 'semaine' | 'mois' | 'dates' | 'sans_fin';

export function periodePour(choix: ChoixPeriode, aujourdhui: Jour): { debut: Jour; fin: Jour | null } {
  switch (choix) {
    case 'semaine': { const l = lundiDe(aujourdhui); return { debut: l, fin: ajouterJours(l, 6) }; }
    case 'mois': { const m = aujourdhui.slice(0, 7); return { debut: premierDuMois(m), fin: dernierDuMois(m) }; }
    case 'dates': return { debut: aujourdhui, fin: ajouterJours(aujourdhui, 29) };
    case 'sans_fin': return { debut: aujourdhui, fin: null };
  }
}

// ------------------------------------------------------------------ jour par jour

/** Valeur agrégée d'une clé pour chaque jour où elle a été saisie. */
export function parJour(valeurs: ValeurSaisie[], m: Pick<Metrique, 'cle' | 'type'>, debut: Jour, fin: Jour): Map<Jour, number> {
  const groupes = new Map<Jour, ValeurSaisie[]>();
  for (const v of valeursEntre(valeurs, m.cle, debut, fin)) { const l = groupes.get(v.jour); if (l) l.push(v); else groupes.set(v.jour, [v]); }
  const res = new Map<Jour, number>();
  for (const [j, l] of groupes) { const a = agreger(m.type, l); if (a != null) res.set(j, a); }
  return res;
}

/** Textes (références, passages) saisis pour une clé, par jour. */
export function textesParJour(valeurs: ValeurSaisie[], cle: string, debut: Jour, fin: Jour): Map<Jour, string> {
  const res = new Map<Jour, string[]>();
  for (const v of valeursEntre(valeurs, cle, debut, fin)) {
    const t = v.texte?.trim();
    if (!t) continue;
    const l = res.get(v.jour); if (l) { if (!l.includes(t)) l.push(t); } else res.set(v.jour, [t]);
  }
  return new Map([...res].map(([j, l]) => [j, l.join(' · ')]));
}

/** La journée a-t-elle atteint son objectif ? (heure : selon le sens ; sinon valeur ≥ objectif, ou ≤ s'il faut moins). */
export function jourAtteint(m: Pick<Metrique, 'type' | 'sens'>, valeur: number | undefined, objectif: number | null): boolean {
  if (valeur == null || objectif == null) return false;
  if (m.sens === 'moins') return valeur <= objectif;
  return valeur >= objectif - 1e-9;
}

// ------------------------------------------------------------------ reprise du passé

/** Annonce de la reprise : « 5 jours de saisies trouvés du 1er au 5 oct. : 23 chapitres, 2 h 30. » (spec §6, US-17). */
export function resumeReprise(valeurs: ValeurSaisie[], ms: Pick<Metrique, 'cle' | 'type' | 'unite' | 'nom' | 'options'>[], debut: Jour, jusqua: Jour): string | null {
  if (jusqua < debut) return null;
  const cles = new Set(ms.filter((m) => m.type !== 'reference').map((m) => m.cle));
  const retenues = valeurs.filter((v) => cles.has(v.cle) && v.jour >= debut && v.jour <= jusqua);
  if (!retenues.length) return null;
  const jours = [...new Set(retenues.map((v) => v.jour))].sort();
  const parties: string[] = [];
  const vus = new Set<string>();
  for (const m of ms) {
    if (m.type === 'reference' || vus.has(m.cle)) continue;
    vus.add(m.cle);
    const total = agreger(m.type, retenues.filter((v) => v.cle === m.cle));
    if (total == null || (total === 0 && TYPES[m.type].agregation === 'somme')) continue;
    const texte = m.type === 'montant' ? `${valeurTexte(m, total)} (${m.nom.toLowerCase()})`
      : m.type === 'fois' ? `${nombre(total)} × ${m.nom.toLowerCase()}`
      : m.type === 'oui_non' ? `${nombre(total)} « oui »` : valeurTexte(m, total);
    parties.push(texte);
  }
  const [premier, dernier] = [jours[0], jours.at(-1)!];
  const memeMois = premier.slice(0, 7) === dernier.slice(0, 7);
  const plage = jours.length === 1 ? `le ${jourCourt(premier)}`
    : `du ${memeMois ? jourCourt(premier).split(' ')[0] : jourCourt(premier)} au ${jourCourt(dernier)}`;
  return `${jours.length} jour${jours.length > 1 ? 's' : ''} de saisies trouvé${jours.length > 1 ? 's' : ''} ${plage}${parties.length ? ' : ' + parties.join(', ') : ''}.`;
}

// ------------------------------------------------------------------ graphique du mois

export interface BarreJour { jour: Jour; valeur: number | null; etat: 'avenir' | 'zero' | 'atteint' | 'partiel' | 'aujourdhui' }

/** Une barre par jour du mois : à venir, vide, atteinte, partielle ou aujourd'hui. */
export function barresDuMois(mois: string, valeurs: Map<Jour, number>, aujourdhui: Jour, debut: Jour, fin: Jour | null, atteint: (v: number) => boolean): BarreJour[] {
  const res: BarreJour[] = [];
  for (let d = 1; d <= joursDuMois(mois); d++) {
    const jour = `${mois}-${String(d).padStart(2, '0')}`;
    const hors = jour < debut || (fin != null && jour > fin);
    const v = valeurs.get(jour) ?? null;
    let etat: BarreJour['etat'];
    if (jour > aujourdhui || hors) etat = 'avenir';
    else if (jour === aujourdhui) etat = v ? (atteint(v) ? 'atteint' : 'aujourdhui') : 'avenir';
    else if (!v) etat = 'zero';
    else etat = atteint(v) ? 'atteint' : 'partiel';
    res.push({ jour, valeur: hors ? null : v, etat });
  }
  return res;
}

// ------------------------------------------------------------------ finances

export interface RolesFinances<T> { entrees?: T; sorties?: T; epargne?: T }

/** Repère les métriques Entrées, Sorties et Épargne d'un sous-projet de finances. */
export function rolesFinances<T extends Pick<Metrique, 'type' | 'nom' | 'cle' | 'sens'>>(ms: T[]): RolesFinances<T> {
  const montants = ms.filter((m) => m.type === 'montant');
  const t = (m: T) => (m.cle + ' ' + m.nom).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const sorties = montants.find((m) => /sorti|depens/.test(t(m))) ?? montants.find((m) => m.sens === 'moins');
  const epargne = montants.find((m) => m !== sorties && /epargn/.test(t(m)));
  const entrees = montants.find((m) => m !== sorties && m !== epargne && /entr|revenu|salaire/.test(t(m))) ?? montants.find((m) => m !== sorties && m !== epargne);
  return { entrees, sorties, epargne };
}

/** Un sous-projet se présente en dollars quand il suit au moins deux montants, dont des entrées et des sorties. */
export function estFinances(ms: Pick<Metrique, 'type' | 'nom' | 'cle' | 'sens'>[]): boolean {
  const r = rolesFinances(ms);
  return !!(r.entrees && r.sorties);
}
