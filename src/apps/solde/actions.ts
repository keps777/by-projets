// Solde NexG et grand livre : calculs purs (filtre, totaux, regroupement par mois, ordre des commissions) et le versement simulé.
import { nouvelId, maintenant, tranche, reinitialiser } from '../../data/store.svelte.ts';
import { arrondi } from '../../core/argent.ts';
import { FRAIS_VERSEMENT } from '../../core/regles.ts';
import { compteDe, connecter, notifier } from '../../domain/compte.ts';
import { ecrire } from '../../domain/marche.ts';
import type { Ecriture } from '../../domain/types.ts';

export type FiltreLivre = 'tout' | 'entrees' | 'sorties';
export const FILTRES: { id: FiltreLivre; label: string }[] = [{ id: 'tout', label: 'Tout' }, { id: 'entrees', label: 'Entrées' }, { id: 'sorties', label: 'Sorties' }];
/** Délai estimé d'un versement (hypothèse) et sa borne haute en jours, pour le règlement simulé. */
export const DELAI_VERSEMENT = '1 à 3 jours ouvrables (hypothèse)';
export const DELAI_VERSEMENT_JOURS = 3;
const J = 24 * 3_600_000;
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/** Écritures d'un compte, de la plus ancienne à la plus récente ; chaque commission suit immédiatement la revente qui l'a déclenchée (même droit). */
export function ecrituresDe(toutes: Ecriture[], compteId: string): Ecriture[] {
  const siennes = toutes.filter((e) => e.compteId === compteId).map((e, i) => ({ e, i })).sort((a, b) => a.e.quand - b.e.quand || a.i - b.i).map((x) => x.e);
  const enfants = siennes.filter((e) => e.type === 'commission');
  const sorties: Ecriture[] = [], pris = new Set<string>();
  for (const e of siennes) {
    if (e.type === 'commission') continue; // placée sous son parent
    sorties.push(e);
    for (const c of enfants) if (!pris.has(c.id) && c.droitId && c.droitId === e.droitId && (e.type === 'revente' || e.type === 'rachat')) { sorties.push(c); pris.add(c.id); }
  }
  for (const c of enfants) if (!pris.has(c.id)) { const i = sorties.findIndex((x) => x.quand > c.quand); if (i < 0) sorties.push(c); else sorties.splice(i, 0, c); }
  return sorties;
}
export const estEntree = (e: Ecriture): boolean => e.montant > 0;
export function filtrer(lignes: Ecriture[], f: FiltreLivre): Ecriture[] { return f === 'entrees' ? lignes.filter((e) => e.montant > 0) : f === 'sorties' ? lignes.filter((e) => e.montant < 0) : lignes; }
/** Totaux du grand livre complet (le filtre n'y change rien, comme dans la maquette). */
export function totaux(lignes: Ecriture[]): { entrees: number; sorties: number } {
  let entrees = 0, sorties = 0;
  for (const e of lignes) { if (e.montant > 0) entrees += e.montant; else sorties += e.montant; }
  return { entrees: arrondi(entrees), sorties: arrondi(sorties) };
}
/** Solde avant le premier mouvement (« Solde d'ouverture »). */
export const soldeOuverture = (lignes: Ecriture[]): number => (lignes.length ? arrondi(lignes[0].solde - lignes[0].montant) : 0);
export interface GroupeMois { cle: string; nom: string; lignes: Ecriture[] }
/** Regroupe par mois (« Août 2026 »), dans l'ordre. */
export function grouperParMois(lignes: Ecriture[]): GroupeMois[] {
  const g: GroupeMois[] = [];
  for (const e of lignes) { const d = new Date(e.quand), cle = `${d.getFullYear()}-${d.getMonth()}`; let x = g[g.length - 1]; if (!x || x.cle !== cle) { x = { cle, nom: `${MOIS[d.getMonth()]} ${d.getFullYear()}`, lignes: [] }; g.push(x); } x.lignes.push(e); }
  return g;
}
/** Un instant « jour seul » du seed (minuit UTC) se lit en UTC, pour ne pas reculer d'un jour à Montréal. */
const parties = (quand: number): { j: number; m: number; a: number } => { const d = new Date(quand), u = quand % 86_400_000 === 0; return u ? { j: d.getUTCDate(), m: d.getUTCMonth(), a: d.getUTCFullYear() } : { j: d.getDate(), m: d.getMonth(), a: d.getFullYear() }; };
export const jourDe = (quand: number): string => String(parties(quand).j);
export const moisCourt = (quand: number): string => MOIS_COURTS[parties(quand).m];
/** « 14 août » (« 1er août » le premier du mois). */
export function jourLong(quand: number): string { const p = parties(quand); return `${p.j === 1 ? '1er' : p.j} ${MOIS_COURTS[p.m]}`; }
/** « 28 août 2026 » (mois en toutes lettres). */
export function dateLongue(quand: number): string { const p = parties(quand); return `${p.j === 1 ? '1er' : p.j} ${MOIS[p.m].toLowerCase()} ${p.a}`; }
/** « 28 août 2026 » abrégé : « 14 janv. 2026 ». */
export function dateCourte(quand: number): string { return `${jourLong(quand)} ${parties(quand).a}`; }
/** « 14 août → 12 oct. 2026 ». */
export function periode(lignes: Ecriture[], now: number): string { return `${jourLong(lignes.length ? lignes[0].quand : now)} → ${new Date(now).getDate()} ${moisCourt(now)} ${new Date(now).getFullYear()}`; }
/** Une commission se présente sous sa revente (ligne « enfant »). */
export const estCommission = (e: Ecriture): boolean => e.type === 'commission';

// --- Versement simulé ---------------------------------------------------------------------------------------------------------------------------------------------
export interface Versement { id: string; compteId: string; montant: number; frais: number; quand: number; arrive: number; statut: 'en_cours' | 'verse'; carte4: string }
/** Suivi des versements (tranche `solde`). Lue seulement ; elle est créée par la première action. */
export const suivi = (): { versements: Versement[] } => tranche('solde', () => ({ versements: [] as Versement[] }));
export const versementsDe = (compteId: string): Versement[] => suivi().versements.filter((v) => v.compteId === compteId);
/** Versements encore en cours (non réglés) du compte. */
export const enCours = (compteId: string): Versement[] => versementsDe(compteId).filter((v) => v.statut === 'en_cours');
/** Montant qui peut être versé : le solde moins les frais de versement (hypothèse : nuls). */
export const montantVersable = (solde: number, frais = FRAIS_VERSEMENT): number => Math.max(0, arrondi(solde - frais));
type Refus = { ok: false; code: 'compte' | 'identite' | 'carte' | 'solde'; message: string };
export type ResultatVersement = { ok: true; montant: number; frais: number; versement: Versement } | Refus;
/** Contrôles avant un versement : compte, identité vérifiée (sinon renvoi vers /identite), compte bancaire fictif, solde positif. */
export function verifierVersement(compteId: string): { ok: true; montant: number; frais: number } | Refus {
  const c = compteDe(compteId); if (!c) return { ok: false, code: 'compte', message: 'Connectez-vous pour verser votre solde.' };
  if (!c.identiteVerifiee) return { ok: false, code: 'identite', message: 'Vérifiez votre identité avant de recevoir un versement.' };
  if (!c.carte4) return { ok: false, code: 'carte', message: 'Ajoutez d’abord un compte pour recevoir le versement.' };
  const montant = montantVersable(c.solde);
  if (montant <= 0) return { ok: false, code: 'solde', message: 'Votre solde disponible est nul : il n’y a rien à verser.' };
  return { ok: true, montant, frais: FRAIS_VERSEMENT };
}
const montantTexte = (n: number): string => `${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')}\u00A0$`;
/** Verse tout le solde disponible : écriture négative `versement` au grand livre, montant « en attente » suivi, notification. Rien n'est réellement payé. */
export function verser(compteId: string): ResultatVersement {
  const v = verifierVersement(compteId); if (!v.ok) return v;
  const c = compteDe(compteId)!, now = maintenant();
  ecrire(compteId, 'versement', `Versement · •••• ${c.carte4}`, -v.montant, { sous: 'En cours · démo, aucun paiement réel' });
  if (v.frais > 0) ecrire(compteId, 'versement', 'Frais de versement', -v.frais, { sous: 'Hypothèse', hypothese: true });
  c.enAttente = arrondi(c.enAttente + v.montant);
  const versement: Versement = { id: nouvelId('vers'), compteId, montant: v.montant, frais: v.frais, quand: now, arrive: now + DELAI_VERSEMENT_JOURS * J, statut: 'en_cours', carte4: c.carte4! };
  suivi().versements.push(versement);
  notifier(compteId, { type: 'vente', titre: `Versement en cours : ${montantTexte(v.montant)} vers •••• ${c.carte4}`, sous: 'Démo : aucun paiement réel.', essentielle: true, lien: '/solde' });
  return { ok: true, montant: v.montant, frais: v.frais, versement };
}
/** Règle les versements dont le délai simulé est écoulé : le montant quitte « en attente ». Renvoie le nombre de versements réglés. */
export function reglerVersements(compteId: string, now: number = maintenant()): number {
  const c = compteDe(compteId); if (!c) return 0;
  let n = 0;
  for (const v of versementsDe(compteId)) if (v.statut === 'en_cours' && now >= v.arrive) { v.statut = 'verse'; c.enAttente = Math.max(0, arrondi(c.enAttente - v.montant)); n++; }
  return n;
}
/** « Réinitialiser la démo » : remet le monde à zéro puis reconnecte le même compte (la session est aussi remise à zéro). */
export function reinitialiserDemo(compteId: string): void { reinitialiser(); connecter(compteId); }
