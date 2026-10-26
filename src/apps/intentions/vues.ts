// Ce que les écrans « intentions » affichent, calculé à partir du monde simulé : lignes de propositions, écarts signés, ce que voient les vendeurs, onglets. Fonctions pures de lecture.
import { maintenant } from '../../data/store.svelte.ts';
import { ecart, fmt, fmtPct, fmtSigne } from '../../core/argent.ts';
import { compagnieDe, droitDe, volDe } from '../../domain/marche.ts';
import type { Compte, Intention, Proposition, Vol } from '../../domain/types.ts';
import { fenetre, jourCourt } from './temps.ts';
import { detailDe, intentionsDe, motifFin, ordinal, rangDetenteur, valideJusqua } from './modele.ts';

export type Onglet = 'actives' | 'conclues' | 'expirees';
export const ONGLETS: { id: Onglet; libelle: string }[] = [{ id: 'actives', libelle: 'Actives' }, { id: 'conclues', libelle: 'Conclues' }, { id: 'expirees', libelle: 'Expirées' }];
export const dansOnglet = (i: Intention, o: Onglet): boolean => (o === 'actives' ? i.statut === 'publiee' : o === 'conclues' ? i.statut === 'accord' : i.statut === 'annulee' && motifFin(i.id) === 'expiree');
export function comptesOnglets(compteId: string): Record<Onglet, Intention[]> {
  const l = intentionsDe(compteId); return { actives: l.filter((i) => dansOnglet(i, 'actives')), conclues: l.filter((i) => dansOnglet(i, 'conclues')), expirees: l.filter((i) => dansOnglet(i, 'expirees')) };
}
/** Propositions encore ouvertes (reçues, engagement non écoulé). */
export const ouvertes = (i: Intention, now: number = maintenant()): Proposition[] => i.propositions.filter((p) => p.statut === 'recue' && valideJusqua(p) > now);

/** Écart d'une proposition au prix maximum : « +80 $ », « +6 % », ou « = votre prix ». Toujours signé : jamais la couleur seule. */
export interface EcartProp { abs: number; sens: 'dessus' | 'egal' | 'dessous'; libelle: string; pct: string; court: string }
export function ecartProposition(prix: number, budget: number): EcartProp {
  const e = ecart(budget, prix), sens = e.abs > 0 ? 'dessus' : e.abs < 0 ? 'dessous' : 'egal';
  return { abs: e.abs, sens, libelle: sens === 'egal' ? '= votre prix' : fmtSigne(e.abs), pct: fmtPct(Math.round(e.pct)), court: sens === 'egal' ? '= votre prix' : `${fmtSigne(e.abs)} vs votre max` };
}
/** Écart au prix neuf équivalent du vol : « −33 % ». */
export const ecartNeuf = (prix: number, vol: Vol): string => fmtPct(Math.round(ecart(vol.prixNeuf, prix).pct));
/** « Aérolys 816 · direct » ou « Nordelle 224 · 1 escale (KEF) ». */
export function titreVol(v: Vol): string {
  const c = compagnieDe(v), no = v.numero.split(' ').slice(1).join(' ');
  return `${c.nom} ${no} · ${v.escales.length ? `${v.escales.length} escale${v.escales.length > 1 ? 's' : ''} (${v.escales.join(', ')})` : 'direct'}`;
}
/** « détenteur vérifié » / « 2e détenteur, vérifié ». */
export function vendeurLibelle(rang: number): string { return rang > 1 ? `${ordinal(rang)} détenteur, vérifié` : 'détenteur vérifié'; }

export interface LigneProposition { id: string; prix: number; delta: string; sens: EcartProp['sens']; titre: string; sous: string; badge: string; ton: 'gris' | 'vert' | 'neutre'; ouverte: boolean; aria: string }
/** Les propositions affichées (reçues ou expirées), de la moins chère à la plus chère. */
export function lignesPropositions(i: Intention, now: number = maintenant()): LigneProposition[] {
  const auto = detailDe(i).auto;
  return i.propositions.filter((p) => p.statut === 'recue' || p.statut === 'expiree').sort((a, b) => a.prix - b.prix).map((p) => {
    const d = droitDe(p.droitId), v = d ? volDe(d.volId) : undefined, e = ecartProposition(p.prix, i.budget), ouverte = p.statut === 'recue' && valideJusqua(p) > now;
    const badge = !ouverte ? 'Expirée' : e.sens === 'dessus' ? 'Au-dessus de votre prix' : e.sens === 'egal' ? (auto ? 'Au prix : accord automatique en cours' : 'À votre prix') : 'Sous votre prix';
    const titre = v ? titreVol(v) : 'Billet', sous = `${v ? jourCourt(v.jour) : ''} · ${vendeurLibelle(d ? rangDetenteur(d) : 1)}`;
    const mot = e.sens === 'dessus' ? `${fmt(e.abs)} au-dessus de votre prix` : e.sens === 'dessous' ? `${fmt(-e.abs)} sous votre prix` : 'au prix';
    return { id: p.id, prix: p.prix, delta: e.libelle, sens: e.sens, titre, sous, badge, ton: !ouverte ? 'neutre' : e.sens === 'dessus' ? 'gris' : 'vert', ouverte, aria: `Proposition à ${fmt(p.prix)}, ${titre}, ${sous}, ${mot}${ouverte ? '' : ', expirée'}` };
  });
}
/** Ce que voient les vendeurs : l'initiale (ou le nom si l'anonymat est désactivé), le trajet et le prix max — jamais le nom complet ni la carte. */
export function vueVendeurs(i: Intention, c: Compte | undefined): { initiale: string; trajet: string; fenetre: string; max: string; fonds: boolean } {
  const d = detailDe(i), prenom = c?.prenom ?? '';
  return { initiale: d.anonyme ? `${prenom.charAt(0).toUpperCase()}.` : `${prenom} ${(c?.nom ?? '').charAt(0)}.`.trim(), trajet: `${i.de} → ${i.vers}`, fenetre: fenetre(d.du, d.au).replace(/ \d{4}$/, ''), max: fmt(i.budget), fonds: i.fondsReserves > 0 };
}
/** « Carte •••• 4821 (test) », « Solde NexG », « Wallet du téléphone ». */
export function libelleSource(source: string, c: Compte | undefined): string { return source === 'carte' ? `Carte •••• ${c?.carte4 ?? '····'} (test)` : source === 'solde' ? 'Solde NexG' : 'Wallet du téléphone'; }
export const nomAnonyme = (c: Compte | undefined): { initiale: string; nom: string } => ({ initiale: `${(c?.prenom ?? '').charAt(0).toUpperCase()}.`, nom: `${c?.prenom ?? ''} ${(c?.nom ?? '').charAt(0)}.`.trim() });
