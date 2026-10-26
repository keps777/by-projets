// Intentions d'achat (« Dire son prix ») : ce que le monde simulé ne porte pas dans `Intention` (fenêtre, options, source des fonds, accord, contre-propositions) vit dans la tranche « intentions ».
// Règles provisoires (hypothèses des maquettes) : une proposition engage son vendeur 48 h ; le prix maximum se règle par pas de 10 $ ; les fonds sont réservés, jamais débités avant l'accord.
import { MAINTENANT_DEMO } from '../../data/constantes.ts';
import { app, tranche } from '../../data/store.svelte.ts';
import { droitDe, volDe } from '../../domain/marche.ts';
import type { Droit, Intention, Proposition } from '../../domain/types.ts';
import { decaler, jourDe } from './temps.ts';

const H = 3_600_000, J = 24 * H;
/** Durée d'engagement d'un vendeur sur sa proposition (hypothèse). */
export const ENGAGEMENT_H = 48;
/** Pas du prix maximum et de la contre-proposition ($). */
export const PAS_PRIX = 10;
/** Voyageurs par intention (démo). */
export const MAX_VOYAGEURS = 9;
export type Validite = '7' | '30' | 'j3';
export type SourceFonds = 'carte' | 'solde' | 'wallet';

export interface Options { auto: boolean; auDessus: boolean; anonyme: boolean }
/** Ce qu'on choisit en publiant : la même forme sert de brouillon (écran 23) puis de détail enregistré (écran 24). */
export interface Brouillon extends Options { de: string; vers: string; aller: 'simple' | 'retour'; du: string; au: string; flexible: boolean; retour?: { du: string; au: string }; voyageurs: number; budget: number; validite: Validite }
export interface DetailIntention extends Brouillon { expire: number; source: SourceFonds }
export interface Accord { droitId: string; prix: number; quand: number; reserve: number; capture: number; enPlus: number; source: SourceFonds; refusees: number }
export interface Contre { propositionId: string; prix: number; quand: number }
export type MotifFin = 'expiree' | 'retiree';
export interface TrancheIntentions { details: Record<string, DetailIntention>; accords: Record<string, Accord>; contres: Contre[]; fins: Record<string, MotifFin>; brouillon?: Brouillon }
export const trancheVide = (): TrancheIntentions => ({ details: {}, accords: {}, contres: [], fins: {} });
/** À appeler depuis une action ou l'initialisation d'un écran (jamais depuis un `$derived`). */
export const trancheIntentions = (): TrancheIntentions => tranche<TrancheIntentions>('intentions', trancheVide);
/** Lecture seule (sans créer la tranche : sûr dans un `$derived`). */
export const lire = (): TrancheIntentions => (app.tranches.intentions as TrancheIntentions | undefined) ?? trancheVide();

export const intentionDe = (id: string | null | undefined): Intention | undefined => (id ? app.monde.intentions.find((i) => i.id === id) : undefined);
export const intentionsDe = (compteId: string): Intention[] => app.monde.intentions.filter((i) => i.compteId === compteId).sort((a, b) => b.creeLe - a.creeLe);
export const propositionDe = (i: Intention, pid: string): Proposition | undefined => i.propositions.find((p) => p.id === pid);

/** Date limite d'une intention selon sa validité : 7 jours, 30 jours, ou « jusqu'à J-3 » (3 jours avant le premier jour de la fenêtre). */
export function expirationDe(validite: Validite, du: string, depuis: number): number {
  if (validite === '7') return depuis + 7 * J;
  if (validite === '30') return depuis + 30 * J;
  return Date.parse(`${decaler(du, -3)}T23:59`);
}
/** Détail d'une intention : celui qui est enregistré, sinon une valeur déduite du monde de départ (fenêtre autour du vol visé, 30 jours, options par défaut, carte). */
export function detailDe(i: Intention): DetailIntention {
  const enregistre = lire().details[i.id]; if (enregistre) return enregistre;
  const v = i.volId ? volDe(i.volId) : undefined, jour = v?.jour ?? jourDe(i.creeLe);
  const du = decaler(jour, -3), au = decaler(jour, 2);
  return { de: i.de, vers: i.vers, aller: 'simple', du, au, flexible: true, voyageurs: 1, budget: i.budget, validite: '30', auto: true, auDessus: true, anonyme: true, source: 'carte',
    expire: (i.statut === 'publiee' ? Date.parse(MAINTENANT_DEMO) : i.creeLe) + 30 * J };
}
/** Fonds à réserver : le prix maximum par voyageur, multiplié par le nombre de voyageurs. */
export const montantReserve = (budget: number, voyageurs: number): number => budget * voyageurs;
/** Jusqu'à quand une proposition engage son vendeur. */
export const valideJusqua = (p: Proposition): number => p.quand + ENGAGEMENT_H * H;
export const contreDe = (propositionId: string): Contre | undefined => lire().contres.find((c) => c.propositionId === propositionId);
export const motifFin = (id: string): MotifFin | undefined => lire().fins[id];

/** Rang du détenteur actuel d'un droit : 1er, 2e, 3e… (maillons qui transmettent la propriété). */
export const rangDetenteur = (d: Droit): number => d.chaine.filter((m) => m.type !== 'nommage' && m.type !== 'gel' && m.type !== 'degel' && m.type !== 'rachat').length;
/** « 1er » / « 2e » / « 3e » */
export const ordinal = (n: number): string => (n <= 1 ? '1er' : `${n}e`);

/** Accord conclu d'une intention : celui qui est enregistré, sinon déduit (proposition acceptée, ou droit du compte sur le vol visé au prix maximum). */
export function accordDe(i: Intention): Accord | undefined {
  if (i.statut !== 'accord') return undefined;
  const enregistre = lire().accords[i.id]; if (enregistre) return enregistre;
  const acceptee = i.propositions.find((p) => p.statut === 'acceptee');
  const droit = acceptee ? droitDe(acceptee.droitId) : app.monde.droits.find((d) => d.detenteurId === i.compteId && d.volId === i.volId);
  if (!droit) return undefined;
  const prix = acceptee?.prix ?? i.budget;
  return { droitId: droit.id, prix, quand: acceptee?.quand ?? i.creeLe + 12 * J, reserve: prix, capture: prix, enPlus: 0, source: detailDe(i).source, refusees: i.propositions.filter((p) => p.statut === 'refusee').length };
}
