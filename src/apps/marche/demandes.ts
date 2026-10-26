// Intentions d'achat vues par un vendeur : demandes compatibles avec ses droits en vente, filtres, tri, chances d'acceptation d'une proposition. Lectures du monde simulé.
import { app, maintenant } from '../../data/store.svelte.ts';
import { sousPlafond } from '../../core/regles.ts';
import { compteDe } from '../../domain/compte.ts';
import { departDuVol, volDe } from '../../domain/marche.ts';
import { billetsCompatibles } from '../intentions/compat.ts';
import { detailDe, type DetailIntention } from '../intentions/modele.ts';
import type { Droit, Intention, Vol } from '../../domain/types.ts';
import { fmt } from '../../core/argent.ts';
import { fenetreJours, jourCourt } from './format.ts';

const J = 86_400_000;
export type FiltreDemandes = 'mes' | 'tous' | 'Caraïbes' | 'Europe';
export type TriDemandes = 'prix' | 'expiration';
export interface BilletVendeur { droit: Droit; vol: Vol; prix: number }
export interface Demande {
  intention: Intention; detail: DetailIntention; /** « M. » : l'acheteur reste anonyme. */ initiale: string; ville: string; zone: string; max: number; joursRestants: number; fenetre: string;
  /** Mes droits en vente qui répondent à l'intention (dans la fenêtre, même trajet). */ billets: BilletVendeur[]; meme: boolean; /** Un billet à moi en vente sur le même trajet, mais hors de la fenêtre. */ horsFenetre?: BilletVendeur;
}
const initialeDe = (compteId: string): string => `${(compteDe(compteId)?.prenom ?? '?').trim().charAt(0).toUpperCase() || '?'}.`;
/** Toutes les intentions publiées et encore valables d'autres comptes, avec mes billets en vente qui y répondent. */
export function demandesPour(compteId: string, quand: number = maintenant()): Demande[] {
  const mes = app.monde.droits.filter((d) => d.detenteurId === compteId && d.statut === 'en_vente' && d.annonce);
  const out: Demande[] = [];
  for (const i of app.monde.intentions) {
    if (i.statut !== 'publiee' || i.compteId === compteId) continue;
    const detail = detailDe(i); if (detail.expire <= quand) continue;
    const ap = app.monde.aeroports.find((a) => a.code === i.vers);
    const ids = new Set(billetsCompatibles(detail).map((b) => b.droit.id));
    const billets = mes.filter((d) => ids.has(d.id)).flatMap((d) => { const vol = volDe(d.volId); return vol ? [{ droit: d, vol, prix: d.annonce!.prix }] : []; });
    const hors = billets.length ? undefined : mes.filter((d) => volDe(d.volId)?.de === i.de && volDe(d.volId)?.vers === i.vers).flatMap((d) => { const vol = volDe(d.volId); return vol ? [{ droit: d, vol, prix: d.annonce!.prix }] : []; })[0];
    out.push({ intention: i, detail, initiale: initialeDe(i.compteId), ville: ap?.ville ?? i.vers, zone: ap?.zone ?? '', max: i.budget, joursRestants: Math.max(0, Math.ceil((detail.expire - quand) / J)), fenetre: fenetreJours(detail.du, detail.au), billets, meme: billets.length > 0, horsFenetre: hors });
  }
  return out;
}
export function filtrer(l: Demande[], f: FiltreDemandes): Demande[] { return f === 'mes' ? l.filter((d) => d.meme) : f === 'tous' ? l : l.filter((d) => d.zone === f); }
export function trier(l: Demande[], t: TriDemandes): Demande[] { return [...l].sort((a, b) => (t === 'prix' ? b.max - a.max || a.joursRestants - b.joursRestants : a.joursRestants - b.joursRestants || b.max - a.max)); }
export const fondsTotal = (l: Demande[]): number => l.reduce((s, d) => s + d.intention.fondsReserves, 0);
/** Un billet répond-il toujours à l'intention, et son vendeur peut-il encore s'engager ? */
export const peutRepondre = (d: Demande, droitId: string): boolean => d.billets.some((b) => b.droit.id === droitId) && departDuVol(d.billets[0]!.vol) > maintenant();

export type NiveauChances = 'Certaine' | 'Bonnes' | 'Moyennes' | 'Faibles';
export interface Chances { niveau: NiveauChances; barres: 0 | 1 | 2 | 3; pourquoi: string; immediate: boolean }
/** Chances d'acceptation d'un prix proposé : certaines (vente immédiate) jusqu'au prix max si l'acheteur accepte automatiquement ; ensuite elles baissent (estimation, jamais une garantie). */
export function chances(prix: number, max: number, auto: boolean, auDessus: boolean): Chances {
  if (prix <= max && auto) return { niveau: 'Certaine', barres: 3, immediate: true, pourquoi: 'Vous acceptez son prix maximum : les fonds sont déjà réservés, la vente est conclue tout de suite.' };
  if (prix <= max) return { niveau: 'Bonnes', barres: 2, immediate: false, pourquoi: 'À son prix maximum ou en dessous : l’acheteur valide chaque proposition à la main.' };
  if (!auDessus) return { niveau: 'Faibles', barres: 0, immediate: false, pourquoi: 'L’acheteur ne reçoit que les propositions à son prix maximum ou en dessous.' };
  if (prix <= max * 1.25) return { niveau: 'Bonnes', barres: 2, immediate: false, pourquoi: 'Jusqu’à 25 % au-dessus de son prix maximum. L’acheteur reçoit les propositions au-dessus de son prix ; il peut accepter, refuser ou contre-proposer.' };
  if (prix <= max * 1.625) return { niveau: 'Moyennes', barres: 1, immediate: false, pourquoi: 'Nettement au-dessus de son prix maximum. L’acheteur devra réserver des fonds supplémentaires pour accepter.' };
  return { niveau: 'Faibles', barres: 0, immediate: false, pourquoi: 'Bien au-dessus de son prix maximum et proche du prix d’un billet neuf. Estimation, non garantie.' };
}
/** Prix proposés rapidement : son prix maximum, puis +12,5 % et +25 % (au pas de 10 $, sous le plafond). */
export function prixRapides(max: number, plafondVol: number, auDessus: boolean): number[] {
  const l = [max, ...(auDessus ? [Math.round((max * 1.125) / 10) * 10, Math.round((max * 1.25) / 10) * 10] : [])];
  return [...new Set(l)].filter((p) => sousPlafond(p, plafondVol));
}

/** Texte de compatibilité d'une demande avec mes billets en vente. */
export function texteCompat(d: Demande): string {
  const b = d.billets[0], h = d.horsFenetre;
  if (b) return `Compatible avec votre billet ${b.vol.de} → ${b.vol.vers} ${jourCourt(departDuVol(b.vol))} (en vente à ${fmt(b.prix)})`;
  if (h) return `Même trajet · votre billet du ${jourCourt(departDuVol(h.vol))} est hors fenêtre`;
  return '';
}
export const demandeDe = (compteId: string, intentionId: string): Demande | undefined => demandesPour(compteId).find((d) => d.intention.id === intentionId);
