// Billets compatibles avec une intention, repères de prix, chances d'accord, validation du brouillon. Lectures du monde simulé, aucune écriture.
import { app, maintenant } from '../../data/store.svelte.ts';
import { arrondi } from '../../core/argent.ts';
import { peutEchanger } from '../../core/regles.ts';
import { departDuVol, volDe } from '../../domain/marche.ts';
import type { Droit, Vol } from '../../domain/types.ts';
import { MAX_VOYAGEURS, PAS_PRIX, type Brouillon, type Options, type Validite } from './modele.ts';
import { decaler, jourDe } from './temps.ts';

const sansAccent = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** « Montréal (YUL) », « yul » ou « montreal » → le code d'aéroport du monde simulé ; texte vide ou inconnu → undefined. */
export function codeAeroport(texte: string): string | undefined {
  const t = texte.trim(); if (!t) return undefined;
  const code = /\(([A-Za-z]{3})\)\s*$/.exec(t)?.[1] ?? (/^[A-Za-z]{3}$/.test(t) ? t : undefined);
  if (code) { const a = app.monde.aeroports.find((x) => x.code === code.toUpperCase()); if (a) return a.code; }
  const n = sansAccent(t.replace(/\s*\([^)]*\)\s*$/, '')); return app.monde.aeroports.find((x) => sansAccent(x.ville) === n)?.code;
}
export const libelleAeroport = (code: string): string => { const a = app.monde.aeroports.find((x) => x.code === code); return a ? `${a.ville} (${a.code})` : code; };
export const villeDe = (code: string): string => app.monde.aeroports.find((x) => x.code === code)?.ville ?? code;

/** Fenêtre par défaut autour d'un jour de recherche : 3 jours avant, 2 jours après (« 18 déc. » → 15–20 déc.). */
export const fenetreAutour = (jour: string): { du: string; au: string } => ({ du: decaler(jour, -3), au: decaler(jour, 2) });
export const jourValide = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00`));

export interface Critere { de: string; vers: string; du: string; au: string; flexible: boolean }
const dansFenetre = (v: Vol, c: Critere): boolean => (c.flexible ? v.jour >= c.du && v.jour <= c.au : v.jour === c.du || v.jour === c.au);
/** Vols du trajet dans la fenêtre. */
export const volsCompatibles = (c: Critere): Vol[] => app.monde.vols.filter((v) => v.de === c.de && v.vers === c.vers && dansFenetre(v, c));
/** Billets en revente compatibles (même trajet, dans la fenêtre, encore échangeables), hors ceux du compte `sauf`, du moins cher au plus cher. */
export function billetsCompatibles(c: Critere, sauf?: string): { droit: Droit; vol: Vol; prix: number }[] {
  const liste: { droit: Droit; vol: Vol; prix: number }[] = [];
  for (const d of app.monde.droits) {
    if (d.statut !== 'en_vente' || !d.annonce || d.detenteurId === sauf) continue;
    const v = volDe(d.volId); if (!v || !dansFenetre(v, c) || v.de !== c.de || v.vers !== c.vers || !peutEchanger(departDuVol(v), maintenant())) continue;
    liste.push({ droit: d, vol: v, prix: d.annonce.prix });
  }
  return liste.sort((a, b) => a.prix - b.prix || a.droit.id.localeCompare(b.droit.id));
}
/** Prix équivalent d'un billet neuf pour ce trajet : le moins cher des vols de la fenêtre, à défaut des vols du trajet. */
export function prixNeufRef(c: Critere): number | undefined {
  const dans = volsCompatibles(c).map((v) => v.prixNeuf), tous = app.monde.vols.filter((v) => v.de === c.de && v.vers === c.vers).map((v) => v.prixNeuf);
  const l = dans.length ? dans : tous; return l.length ? Math.min(...l) : undefined;
}
/** Bornes du curseur de prix maximum : de 30 % du prix neuf (par 50 $) au prix neuf équivalent (le plafond de revente). */
export function bornesPrix(neuf: number): { min: number; max: number } {
  const max = Math.round(neuf / PAS_PRIX) * PAS_PRIX; return { min: Math.min(max, Math.max(50, Math.floor((neuf * 0.3) / 50) * 50)), max };
}
/** Prix maximum proposé au départ : environ 63 % du prix neuf, au pas de 10 $. */
export const prixParDefaut = (neuf: number): number => { const b = bornesPrix(neuf); return Math.min(b.max, Math.max(b.min, Math.round((neuf * 0.634) / PAS_PRIX) * PAS_PRIX)); };
export const calerPrix = (v: number, neuf: number): number => { const b = bornesPrix(neuf); return Math.min(b.max, Math.max(b.min, Math.round(v / PAS_PRIX) * PAS_PRIX)); };

export type Chance = 'faibles' | 'moyennes' | 'bonnes';
export interface Reperes { vendeurs: number; auPrix: number; meilleure?: number; neuf?: number; niveau: 1 | 2 | 3; chance: Chance; aide: string }
/** Repères d'un prix maximum : combien de billets compatibles sont à ce prix ou en dessous, et quelles chances d'accord (estimation, jamais une garantie). */
export function reperes(c: Critere, budget: number, sauf?: string): Reperes {
  const l = billetsCompatibles(c, sauf), auPrix = l.filter((b) => b.prix <= budget).length, niveau = auPrix >= 2 ? 3 : auPrix === 1 ? 2 : 1;
  const aide = niveau === 3 ? `${auPrix} billets compatibles sont déjà à votre prix ou en dessous.` : niveau === 2 ? '1 billet compatible est déjà à votre prix ; les autres sont au-dessus.' : l.length ? 'Aucun billet compatible n’est à ce prix aujourd’hui : il faudra qu’un vendeur baisse.' : 'Aucun billet compatible n’est en vente aujourd’hui : il faudra qu’un vendeur en mette un.';
  return { vendeurs: l.length, auPrix, meilleure: l[0]?.prix, neuf: prixNeufRef(c), niveau, chance: niveau === 3 ? 'bonnes' : niveau === 2 ? 'moyennes' : 'faibles', aide };
}
/** « 4 vendeurs compatibles · 1 à votre prix ou moins » */
export function libelleVendeurs(r: Reperes): string {
  if (!r.vendeurs) return 'Aucun vendeur compatible pour l’instant';
  return `${r.vendeurs} vendeur${r.vendeurs > 1 ? 's' : ''} compatible${r.vendeurs > 1 ? 's' : ''} · ${r.auPrix} à votre prix ou moins`;
}
export const aideValidite = (validite: Validite, expire: number): string => {
  const jour = new Date(expire).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
  return validite === 'j3' ? `Jusqu’au ${jour}, trois jours avant le premier jour de votre fenêtre. Fonds libérés automatiquement à cette date si aucun accord.` : `Expire le ${jour}. Fonds libérés automatiquement à cette date si aucun accord.`;
};
export const aideFenetre = (flexible: boolean, du: string, au: string): string => {
  const j = (s: string) => new Date(`${s}T12:00`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  return flexible ? `Tout départ du ${j(du).split(' ')[0]} au ${j(au)} vous convient : un vendeur peut proposer n’importe quel jour de la fenêtre.` : `Seuls les billets datés exactement du ${j(du)} ou du ${j(au)} seront proposés.`;
};
export const aideOptions = (o: Options, prix: string, initiale: string, nom: string): { auto: string; auDessus: string; anonyme: string } => ({
  auto: o.auto ? `Une proposition à ${prix} ou moins conclut l’accord sans attendre.` : 'Vous validerez chaque proposition à la main.',
  auDessus: o.auDessus ? 'Vous pourrez accepter, refuser ou contre-proposer.' : 'Seules les propositions à votre prix ou moins vous parviendront.',
  anonyme: `Les vendeurs voient « ${o.anonyme ? initiale : nom} », votre trajet et votre prix max.`
});

export type ChampBrouillon = 'de' | 'vers' | 'du' | 'au' | 'retour' | 'voyageurs' | 'budget' | 'trajet';
/** Erreurs du brouillon, par champ. Vide = on peut réserver les fonds. */
export function erreursBrouillon(b: Brouillon, now: number = maintenant()): Partial<Record<ChampBrouillon, string>> {
  const e: Partial<Record<ChampBrouillon, string>> = {}, aujourdhui = jourDe(now);
  if (!app.monde.aeroports.some((a) => a.code === b.de)) e.de = 'Aéroport de départ inconnu : choisissez-en un, par exemple Montréal (YUL).';
  if (!app.monde.aeroports.some((a) => a.code === b.vers)) e.vers = 'Aéroport d’arrivée inconnu : choisissez-en un, par exemple Paris (CDG).';
  if (!e.de && !e.vers && b.de === b.vers) e.vers = 'Le départ et l’arrivée doivent être différents.';
  if (!b.du || !b.au) e.du = 'Indiquez la fenêtre de départ.';
  else if (b.du < aujourdhui) e.du = 'La fenêtre de départ ne peut pas commencer dans le passé.';
  else if (b.au < b.du) e.au = 'La fin de la fenêtre doit être le même jour ou après le début.';
  if (b.aller === 'retour' && b.retour && (b.retour.au < b.retour.du || b.retour.du < b.au)) e.retour = 'Le retour doit être après le départ, et sa fin après son début.';
  if (!Number.isInteger(b.voyageurs) || b.voyageurs < 1 || b.voyageurs > MAX_VOYAGEURS) e.voyageurs = `De 1 à ${MAX_VOYAGEURS} voyageurs.`;
  const neuf = !e.de && !e.vers ? prixNeufRef(b) : undefined;
  if (!e.de && !e.vers && neuf === undefined) e.trajet = 'Aucun vol connu sur ce trajet pour l’instant.';
  if (neuf !== undefined) { const { min, max } = bornesPrix(neuf); if (!(b.budget >= min && b.budget <= max)) e.budget = `Le prix maximum se règle entre ${min} $ et ${max} $.`; }
  return e;
}
export const brouillonValide = (b: Brouillon, now?: number): boolean => Object.keys(erreursBrouillon(b, now)).length === 0;
/** Total à réserver (arrondi) : prix maximum × voyageurs. */
export const totalReserve = (b: Pick<Brouillon, 'budget' | 'voyageurs'>): number => arrondi(b.budget * b.voyageurs);
