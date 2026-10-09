// Rapport quotidien, hebdomadaire et mensuel (spec §9). Toutes les métriques d'un point sont visibles,
// l'une après l'autre, séparées par des points-virgules, sous la forme « fait / attendu ».
import { ajouterJours, ecartJours, joursDuMois, maxJour, minJour, moisDe, premierDuMois, dernierDuMois } from './dates.ts';
import { TYPES, agreger, libelleChoix, valeursEntre } from './metriques.ts';
import { fenetreDuMois, joursTotaux } from './progression.ts';
import { formatHeure, formatMontantCourt, formatPoids, formatTemps, nombre } from './units.ts';
import { CLE_LIVRE, cleDuLivre, type LivreSuivi } from './lignes.ts';
import type { Jour, Metrique, OptionChoix, SousProjetPeriode, TypeMetrique, ValeurSaisie } from './types.ts';

export type Langue = 'fr' | 'en';

export interface MesureRapport {
  type: TypeMetrique;
  unite?: string;
  /** Unité de base. `null` pour un texte pur. */
  fait: number | null;
  attendu?: number | null;
  texte?: string;
  approx?: boolean;
  /** Détail des séances déjà formaté, ex. ['0h12', '~0h16']. */
  details?: string[];
  options?: OptionChoix[];
  /** Préfixe, ex. « + » pour « +24 p. ». */
  prefixe?: string;
}

/** Pages d'un livre : cumul (départ compris), total du livre et pages lues pendant la période. */
export interface LivreRapport { cumul: number; total: number | null; periode: number }
export interface ItemRapport { titre: string; auteur?: string; mesures: MesureRapport[]; livre?: LivreRapport }
export interface PointRapport { code: string; mesures: MesureRapport[]; items?: ItemRapport[] }

const espaces = (t: string) => t.replace(/[  ]/g, ' ');

const T = {
  fr: { ref: 'réf.', oui: 'oui', non: 'non', rapport: 'Rapport', semaine: 'Rapport de la semaine', mois: 'Rapport du mois', locale: 'fr-CA' },
  en: { ref: 'ref.', oui: 'yes', non: 'no', rapport: 'Report', semaine: 'Weekly report', mois: 'Monthly report', locale: 'en-US' }
} as const;

/**
 * Une mesure écrite. Le détail des séances (« 1h55; 0h40… ») n'entre que si `avecDetails` : il se montre dans la page Rapports,
 * mais le texte exporté (WhatsApp, PDF) ne garde que le total.
 */
/** « chapitres » s'écrit « ch » dans le rapport (« 9/7 ch »). */
const uniteRapport = (u: string | undefined) => (u && /^(chapitres?|chapters?)$/i.test(u.trim()) ? 'ch' : u);

export function formaterMesure(m: MesureRapport, langue: Langue = 'fr', avecDetails = false): string {
  const t = T[langue];
  const att = m.attendu;
  switch (m.type) {
    case 'temps': {
      if (m.fait == null) return '—';
      const base = formatTemps(m.fait, m.approx) + (att != null ? '/' + formatTemps(att) : '');
      return avecDetails && m.details?.length ? `${base} (${m.details.join('; ')})` : base;
    }
    case 'fois': return m.fait == null ? '—' : nombre(m.fait) + (att != null ? '/' + nombre(att) : '') + (m.unite ? ` ${m.unite}` : '');
    case 'nombre': return m.fait == null ? '—' : `${m.prefixe ?? ''}${nombre(m.fait)}${att != null ? '/' + nombre(att) : ''}${uniteRapport(m.unite) ? ' ' + uniteRapport(m.unite) : ''}`;
    case 'montant': return m.fait == null ? '—' : espaces(formatMontantCourt(m.fait)) + (att != null ? '/' + espaces(formatMontantCourt(att)) : '');
    case 'oui_non': return (m.fait ?? 0) >= 1 ? t.oui : t.non;
    case 'choix': return m.texte ?? libelleChoix(m.options, m.fait ?? 0);
    case 'distance': return m.fait == null ? '—' : `${nombre(m.fait / 1000)}${att != null ? '/' + nombre(att / 1000) : ''} km`;
    case 'poids': return m.fait == null ? '—' : espaces(formatPoids(m.fait));
    case 'note': return m.fait == null ? '—' : `${nombre(m.fait)}/10`;
    case 'pourcentage': return m.fait == null ? '—' : `${nombre(m.fait)} %`;
    case 'heure': return m.fait == null ? '—' : formatHeure(m.fait);
    case 'reference': return `${t.ref} ${m.texte?.trim() || '—'}`;
  }
}

export const formaterMesures = (ms: MesureRapport[], langue: Langue = 'fr', avecDetails = false) => ms.map((m) => formaterMesure(m, langue, avecDetails)).join('; ');

/** Livre terminé : toutes ses pages sont lues. */
export const livreTermine = (l: Pick<LivreRapport, 'cumul' | 'total'>) => l.total != null && l.total > 0 && l.cumul >= l.total;

/** « 100/120p (+8p auj.) » : cumul sur total, puis les pages de la période (« auj. » pour une seule journée) ; « ✅ » quand le livre est terminé. */
export function formaterLivre(l: LivreRapport, langue: Langue = 'fr', unJour = true): string {
  const base = `${nombre(l.cumul)}${l.total != null ? '/' + nombre(l.total) : ''}p`;
  const quand = unJour ? (langue === 'en' ? ' today' : ' auj.') : '';
  return `${l.periode > 0 ? `${base} (+${nombre(l.periode)}p${quand})` : base}${livreTermine(l) ? ' ✅' : ''}`;
}

export function formaterPoint(n: number, p: PointRapport, langue: Langue = 'fr', unJour = true): string {
  if (p.items?.length) {
    const entete = p.mesures.length ? ` ${formaterMesures(p.mesures, langue)}` : '';
    const lignes = p.items.map((it) => it.livre
      ? `   • ${it.titre}${it.auteur ? ` (${it.auteur})` : ''} : ${formaterLivre(it.livre, langue, unJour)}`
      : `   • _${it.titre}_${it.auteur ? ` (${it.auteur})` : ''} : ${formaterMesures(it.mesures, langue)}`);
    return `${n}. *${p.code}* :${entete}\n${lignes.join('\n')}`;
  }
  return `${n}. *${p.code}* : ${formaterMesures(p.mesures, langue)}`;
}

function dateLongue(j: Jour, langue: Langue): string {
  return new Intl.DateTimeFormat(T[langue].locale, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${j}T00:00:00Z`));
}
function dateCourte(j: Jour, langue: Langue, avecAnnee: boolean): string {
  return new Intl.DateTimeFormat(T[langue].locale, { timeZone: 'UTC', day: 'numeric', month: 'short', ...(avecAnnee ? { year: 'numeric' } : {}) }).format(new Date(`${j}T00:00:00Z`)).replace('.,', ',');
}
function moisLong(j: Jour, langue: Langue): string {
  return new Intl.DateTimeFormat(T[langue].locale, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${j}T00:00:00Z`));
}

export interface EnteteRapport { type: 'jour' | 'semaine' | 'mois'; debut: Jour; fin?: Jour }

export function enteteRapport(e: EnteteRapport, nom: string, langue: Langue = 'fr'): string {
  const t = T[langue];
  if (e.type === 'jour') return `*${t.rapport} · ${dateLongue(e.debut, langue)} · ${nom}*`;
  if (e.type === 'mois') return `*${t.mois} · ${moisLong(e.debut, langue)} · ${nom}*`;
  const fin = e.fin ?? ajouterJours(e.debut, 6);
  return `*${t.semaine} · ${dateCourte(e.debut, langue, false)} – ${dateCourte(fin, langue, true)} · ${nom}*`;
}

export function formaterRapport(o: { langue?: Langue; nom: string; entete: EnteteRapport; points: PointRapport[] }): string {
  const langue = o.langue ?? 'fr';
  return [enteteRapport(o.entete, o.nom, langue), ...o.points.map((p, i) => formaterPoint(i + 1, p, langue, o.entete.type === 'jour'))].join('\n\n');
}

// ---------------------------------------------------------------------------------------------
// Construction des mesures d'un point à partir des saisies

export interface MesureConfig { metrique: Metrique; sousProjet: SousProjetPeriode }

/** Ce qui est attendu pour une journée, dans l'unité de base. */
export function attenduDuJour(m: Metrique, sp: SousProjetPeriode, jour: Jour): number | null {
  if (m.cible == null) return null;
  if (jour < sp.debut || (sp.fin && jour > sp.fin)) return null;
  const agr = TYPES[m.type].agregation;
  if (agr !== 'somme') return m.cible;
  switch (m.periode) {
    case 'jour': return m.cible;
    case 'semaine': return m.cible / 7;
    case 'mois': return m.cible / joursDuMois(moisDe(jour));
    case 'total': { const t = joursTotaux(sp); return t ? m.cible / t : null; }
  }
}

/** Somme de ce qui est attendu entre deux jours (récapitulatifs de semaine et de mois). */
export function attenduEntre(m: Metrique, sp: SousProjetPeriode, debut: Jour, fin: Jour): number | null {
  if (m.cible == null) return null;
  const agr = TYPES[m.type].agregation;
  if (agr !== 'somme') return m.cible;
  let total = 0;
  for (let j = debut; j <= fin; j = ajouterJours(j, 1)) total += attenduDuJour(m, sp, j) ?? 0;
  return total || null;
}

export function mesuresDuPoint(configs: MesureConfig[], valeurs: ValeurSaisie[], debut: Jour, fin: Jour): MesureRapport[] {
  return configs.map(({ metrique: m, sousProjet: sp }) => {
    const v = valeursEntre(valeurs, m.cle, debut, fin);
    if (m.type === 'reference') {
      const textes = [...new Set(v.map((x) => x.texte?.trim()).filter((x): x is string => !!x))];
      return { type: m.type, fait: null, texte: textes.join(' · ') };
    }
    const unJour = debut === fin;
    return {
      type: m.type, unite: m.unite, options: m.options,
      fait: agreger(m.type, v),
      attendu: unJour ? attenduDuJour(m, sp, debut) : attenduEntre(m, sp, debut, fin),
      approx: m.type === 'temps' && v.some((x) => x.approx),
      details: m.type === 'temps' && v.length > 1 && unJour ? v.map((x) => formatTemps(x.valeur, x.approx)) : undefined
    };
  });
}

/**
 * Les pages lues dans un livre (clé « livre:<id> ») comptent aussi dans les pages du jour (« nombre:pages ») : le total de pages d'un point
 * et la progression d'un sous-projet voient les livres comme les autres saisies. À appliquer aux valeurs d'un point ou d'un sous-projet.
 */
export function avecPagesDesLivres<T extends { cle: string }>(valeurs: T[]): T[] {
  const livres = valeurs.filter((v) => v.cle.startsWith(CLE_LIVRE));
  return livres.length ? [...valeurs, ...livres.map((v) => ({ ...v, cle: 'nombre:pages' }))] : valeurs;
}

/** Valeur lue d'un livre : pages d'un jour (clé « livre:<id> » dans les saisies). */
export interface LectureLivre { cle: string; jour: Jour; valeur: number }

/**
 * Lignes « • Titre (AUTEUR) : 100/120p (+8p auj.) » d'un point : tous les livres actifs, comme dans les rapports de l'utilisateur
 * (un livre en cours reste listé chaque jour, avec « (+Np auj.) » les jours où on le lit, et « ✅ » une fois terminé), avec le cumul
 * (pages de départ + toutes les lectures jusqu'à la fin de la période) sur le total. Un livre terminé avant le début du mois du rapport,
 * et non lu depuis, n'est plus listé : le ménage se fait au changement de mois.
 */
export function itemsDesLivres(livres: LivreSuivi[] | null | undefined, lectures: LectureLivre[], debut: Jour, fin: Jour): ItemRapport[] {
  const items: ItemRapport[] = [];
  for (const l of livres ?? []) {
    // Un livre retiré reste au rapport jusqu'au jour de son retrait (les rapports passés ne changent pas).
    if (!l.actif && !(l.retireLe && debut <= l.retireLe)) continue;
    const cle = cleDuLivre(l.id);
    let cumul = l.depart || 0, periode = 0, avantMois = l.depart || 0;
    const moisDebut = premierDuMois(debut.slice(0, 7));
    for (const v of lectures) {
      if (v.cle !== cle || v.jour > fin) continue;
      cumul += v.valeur;
      if (v.jour >= debut) periode += v.valeur;
      if (v.jour < moisDebut) avantMois += v.valeur;
    }
    if (periode <= 0 && livreTermine({ cumul: avantMois, total: l.total })) continue;
    items.push({ titre: l.titre, auteur: l.auteur || undefined, mesures: [], livre: { cumul, total: l.total, periode } });
  }
  return items;
}

export { premierDuMois, dernierDuMois, ecartJours, maxJour, minJour, fenetreDuMois };
