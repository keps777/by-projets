// Rapport quotidien, hebdomadaire et mensuel (spec §9). Toutes les métriques d'un point sont visibles,
// l'une après l'autre, séparées par des points-virgules, sous la forme « fait / attendu ».
import { ajouterJours, ecartJours, joursDuMois, maxJour, minJour, moisDe, premierDuMois, dernierDuMois } from './dates.ts';
import { TYPES, agreger, libelleChoix, valeursEntre } from './metriques.ts';
import { fenetreDuMois, joursTotaux } from './progression.ts';
import { formatHeure, formatMontantCourt, formatPoids, formatTemps, nombre } from './units.ts';
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

export interface ItemRapport { titre: string; auteur?: string; mesures: MesureRapport[] }
export interface PointRapport { code: string; mesures: MesureRapport[]; items?: ItemRapport[] }

const espaces = (t: string) => t.replace(/[  ]/g, ' ');

const T = {
  fr: { ref: 'réf.', oui: 'oui', non: 'non', rapport: 'Rapport', semaine: 'Rapport de la semaine', mois: 'Rapport du mois', locale: 'fr-CA' },
  en: { ref: 'ref.', oui: 'yes', non: 'no', rapport: 'Report', semaine: 'Weekly report', mois: 'Monthly report', locale: 'en-US' }
} as const;

export function formaterMesure(m: MesureRapport, langue: Langue = 'fr'): string {
  const t = T[langue];
  const att = m.attendu;
  switch (m.type) {
    case 'temps': {
      if (m.fait == null) return '—';
      const base = formatTemps(m.fait, m.approx) + (att != null ? '/' + formatTemps(att) : '');
      return m.details?.length ? `${base} (${m.details.join('; ')})` : base;
    }
    case 'fois': return m.fait == null ? '—' : nombre(m.fait) + (att != null ? '/' + nombre(att) : '') + (m.unite ? ` ${m.unite}` : '');
    case 'nombre': return m.fait == null ? '—' : `${m.prefixe ?? ''}${nombre(m.fait)}${att != null ? '/' + nombre(att) : ''}${m.unite ? ' ' + m.unite : ''}`;
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

export const formaterMesures = (ms: MesureRapport[], langue: Langue = 'fr') => ms.map((m) => formaterMesure(m, langue)).join('; ');

export function formaterPoint(n: number, p: PointRapport, langue: Langue = 'fr'): string {
  if (p.items?.length) {
    const lignes = p.items.map((it) => `   • _${it.titre}_${it.auteur ? ` (${it.auteur})` : ''} : ${formaterMesures(it.mesures, langue)}`);
    return `${n}. *${p.code}* :\n${lignes.join('\n')}`;
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
  return [enteteRapport(o.entete, o.nom, langue), ...o.points.map((p, i) => formaterPoint(i + 1, p, langue))].join('\n\n');
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

export { premierDuMois, dernierDuMois, ecartJours, maxJour, minJour, fenetreDuMois };
