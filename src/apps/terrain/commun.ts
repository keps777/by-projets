// Lectures partagées par les écrans de terrain : arrêts d'un départ, passagers à bord, superviseurs de la gare, libellés.
import './terrain.css';
import { aujourdhui, maintenant, nouvelId } from '../../data/store.svelte.ts';
import { app } from '../../data/store.svelte.ts';
import { arretsDeLigne, hash, trajetBillet, type Arret } from '../../core/terrain.ts';
import { billetsDuDepart, departEnMs, departParId, equipeDe, gare, heureLocale, ligneDe, notifier, personne } from '../../domain/actions.ts';
import type { Billet, Depart, Personne } from '../../domain/types.ts';
import { lireSuivi } from './etat.ts';

export { aujourdhui, maintenant, nouvelId };
export const gareNom = (id: string | undefined) => (id ? gare(id)?.nom ?? id : '');
/** Arrêts d'un départ (heures prévues décalées du retard annoncé). */
export function arretsDe(d: Depart): Arret[] {
  const l = ligneDe(d); return arretsDeLigne({ de: l.de, vers: l.vers, gareDe: gareNom(l.gareDe), gareVers: gareNom(l.gareVers) }, d.heure, l.dureeMin, d.retardMin);
}
export const libelleDepart = (d: Depart) => { const l = ligneDe(d); return `${d.heure} ${l.vers}${l.classe === 'VIP' ? ' VIP' : ''}`; };
export const heureReelle = (d: Depart) => heureLocale(departEnMs(d));
export const departsDuJourDe = (jour = aujourdhui()) => app.monde.departs.filter((d) => d.jour === jour && d.statut !== 'annule').sort((a, b) => departEnMs(a) - departEnMs(b));
export const superviseursDe = (gareId: string | undefined): Personne[] => (gareId ? equipeDe(gareId, 'superviseur') : []);
/** Prévient les superviseurs de la gare (une notification chacun). */
export function prevenirSuperviseurs(gareId: string | undefined, titre: string, sous: string, lien = '/superviseur/voir', type = 'terrain') {
  const sup = superviseursDe(gareId); for (const s of sup) notifier(s.id, titre, sous, lien, type); return sup;
}
/** Billets montés dans le bus (scannés) ; ceux déjà descendus n'y sont plus. */
export function aBordIds(departId: string): string[] { const s = lireSuivi(departId); return billetsDuDepart(departId).filter((b) => b.statut === 'scanne' && !s.descendus.includes(b.id)).map((b) => b.id); }
export const nbABord = (departId: string) => aBordIds(departId).length;
/** Billets vendus et payés (valides ou déjà scannés) du départ. */
export const billetsPayes = (departId: string) => billetsDuDepart(departId).filter((b) => b.statut === 'valide' || b.statut === 'scanne');
export const nomPassager = (b: Billet) => b.passager.nom.trim() || 'Sans nom';
/** Arrêt de montée d'un billet : vendu en route (enregistré) sinon attribution déterministe. */
export function arretMonte(b: Billet, montees: Record<string, number>, nbArrets: number): number { return montees[b.id] ?? (b.canal === 'convoyeur' ? 0 : trajetBillet(b.code, nbArrets).monte); }
/** Arrêt de descente : après la montée, sinon le terminus. */
export function arretDescente(b: Billet, nbArrets: number, montees: Record<string, number> = {}): number { const d = trajetBillet(b.code, nbArrets).descend; return d > arretMonte(b, montees, nbArrets) ? d : nbArrets - 1; }
/** Qui descend et qui monte à l'arrêt `i` d'un départ (les extrémités n'ont ni montées ni descentes « en route »). */
export function mouvementsArret(d: Depart, i: number, montees: Record<string, number>): { descendent: Billet[]; montent: Billet[] } {
  const n = arretsDe(d).length; if (i <= 0 || i >= n - 1) return { descendent: [], montent: [] };
  const bs = billetsPayes(d.id);
  return { descendent: bs.filter((b) => b.statut === 'scanne' && arretDescente(b, n, montees) === i), montent: bs.filter((b) => arretMonte(b, montees, n) === i) };
}
export const departOuNul = (id: string | null | undefined) => (id ? departParId(id) ?? null : null);
export const initiales = (p: { prenom?: string; nom: string } | undefined) => (p ? `${(p.prenom ?? p.nom)[0] ?? ''}${p.prenom ? p.nom[0] ?? '' : ''}`.toUpperCase() : '··');
export const nomComplet = (id: string | undefined) => { const p = personne(id); return p ? `${p.prenom} ${p.nom}` : 'Inconnu'; };
export { hash, personne };
const MOYENS: Record<string, string> = { momo: 'MoMo', om: 'Orange Money', carte: 'carte', visage: 'visage', especes: 'espèces', proche: 'payé par un proche' };
export const libelleMoyen = (m: string) => MOYENS[m] ?? m;
/** « 7 500 » : espaces insécables calculés à la main (ne dépend pas des données de langue du navigateur). */
export const milliers = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
export const fcfaF = (n: number) => `${milliers(n)}\u00a0F`;
