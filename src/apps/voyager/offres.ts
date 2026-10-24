// Offres du voyageur : les départs du monde (prix dynamique compris) et les covoiturages, au même format pour le panorama.
import { ecartJours, type Jour } from '../../core/dates.ts';
import { confortDe, type Offre } from '../../core/recherche.ts';
import { fmtF, prixDynamique } from '../../core/tarif.ts';
import { badge } from '../../core/tranches.ts';
import { aujourdhui, app, maintenant } from '../../data/store.svelte.ts';
import { compagnieDe, departsDuJour, gare, ligneDe, personne, placesLibres, remplissage } from '../../domain/actions.ts';
import type { Depart, OffreCovoit } from '../../domain/types.ts';

/** Prix proposé au voyageur : le tarif du départ, ajusté par le prix dynamique du patron (−500 F si peu rempli la veille, +500 F si presque plein). */
export function prixAffiche(d: Depart): number {
  return prixDynamique(d.prix, remplissage(d), Math.max(0, ecartJours(aujourdhui(), d.jour)), !!app.monde.params.tarifs.dynamique);
}
const enVente = (d: Depart) => d.statut === 'prevu' || d.statut === 'embarquement';
export function offreBus(d: Depart): Offre {
  const l = ligneDe(d), c = compagnieDe(d), places = placesLibres(d);
  return { id: d.id, genre: 'bus', heure: d.heure, retardMin: d.retardMin, ab: c.abrev, co: c.nom, col: c.couleur, cl: l.classe, gare: gare(l.gareDe)?.nom ?? '', prix: prixAffiche(d), prixBase: d.prix,
    dureeMin: l.dureeMin, places, cap: d.capacite, vip: l.classe === 'VIP', compagnieId: c.id, departId: d.id, confort: confortDe(l.classe), complet: places === 0 };
}
/** Un covoiturage roule à peu près comme le bus le plus rapide de la ligne (+ 5 min) ; 3 h 20 si aucune ligne n'existe. */
const dureeCovoit = (de: string, vers: string) => { const ds = app.monde.lignes.filter((l) => l.de === de && l.vers === vers).map((l) => l.dureeMin); return ds.length ? Math.min(...ds) + 5 : 200; };
export const placesCovoit = (o: OffreCovoit) => Math.max(0, o.places - o.reservations.reduce((s, r) => s + r.places, 0));
export function offreCovoit(o: OffreCovoit): Offre {
  const p = personne(o.conducteurId), places = placesCovoit(o);
  return { id: o.id, genre: 'cv', heure: o.heure, retardMin: 0, ab: p ? `${p.prenom[0]}${p.nom[0]}` : 'CV', co: p ? `${p.prenom} ${p.nom[0]}.` : 'Conducteur', col: '#FF9BEA', cl: o.vehicule, gare: o.depart,
    prix: o.prix, prixBase: o.prix, dureeMin: dureeCovoit(o.de, o.vers), places, cap: Math.max(4, o.places), vip: false, covoitId: o.id, confort: confortDe('covoit'), complet: places === 0 };
}
const covoitsDuJour = (jour: Jour, de: string, vers: string) => app.monde.covoits.filter((c) => !c.enVille && c.statut === 'ouverte' && c.jour === jour && c.de === de && c.vers === vers
  && (jour !== aujourdhui() || new Date(`${c.jour}T${c.heure}:00`).getTime() > maintenant()));
/** Tout ce qu'on peut réserver ce jour-là : départs en vente (hors annulés, déjà partis) + covoiturages ouverts, sans filtre. */
export function offresDuJour(jour: Jour, de: string, vers: string): Offre[] {
  return [...departsDuJour(jour, de, vers).filter(enVente).map(offreBus), ...covoitsDuJour(jour, de, vers).map(offreCovoit)];
}
export const nbAnnules = (jour: Jour, de: string, vers: string) => app.monde.departs.filter((d) => d.jour === jour && d.statut === 'annule' && ligneDe(d).de === de && ligneDe(d).vers === vers).length;
/** Prix le plus bas d'un jour (bus avec des places), ou null s'il n'y a rien à vendre ce jour-là. */
export function prixBasDuJour(jour: Jour, de: string, vers: string): number | null {
  const ps = departsDuJour(jour, de, vers).filter((d) => enVente(d) && placesLibres(d) > 0).map(prixAffiche);
  return ps.length ? Math.min(...ps) : null;
}
export const villesDeDepart = (): string[] => [...new Set(app.monde.lignes.filter((l) => l.actif).map((l) => l.de))];
export interface Destination { ville: string; gares: string[]; compagnies: number; dureeMin: number; prix: number | null }
/** Villes desservies depuis `de` (lignes actives), avec le prix le plus bas du jour. */
export function destinations(de: string, jour: Jour): Destination[] {
  const lignes = app.monde.lignes.filter((l) => l.actif && l.de === de), vues = [...new Set(lignes.map((l) => l.vers))];
  return vues.map((ville) => {
    const ls = lignes.filter((l) => l.vers === ville);
    return { ville, gares: [...new Set(ls.map((l) => gare(l.gareVers)?.nom ?? ''))], compagnies: new Set(ls.map((l) => l.compagnieId)).size, dureeMin: Math.min(...ls.map((l) => l.dureeMin)), prix: prixBasDuJour(jour, de, ville) };
  });
}
/** Étiquette d'un départ dans sa tranche : complet, retard, dernières places, moins cher, plus rapide… */
export function etiquette(o: Offre, groupe: Offre[]): { texte: string; ton: '' | 'ok' | 'wa' | 'inf' | 'cv' | 'er' } {
  if (o.complet) return { texte: 'complet', ton: 'er' };
  if (o.retardMin > 0) return { texte: `retard +${o.retardMin} min`, ton: 'wa' };
  return badge({ ...o, covoit: o.genre === 'cv' }, groupe);
}
/** Prix sans coupure de ligne (espaces insécables), pour les libellés de boutons. */
export const prixInsecable = (n: number) => fmtF(n).replace(/ /g, '\u00a0');
export const lienPlace = (o: Offre) => `/siege?depart=${o.departId}&prix=${o.prix}`;
export const lienArrets = (o: Offre) => `/arret?depart=${o.departId}`;
export const lienReserverCovoit = (o: Offre) => `/paiement?covoit=${o.covoitId}`;
export const lienConducteur = (o: Offre) => `/covoit?covoit=${o.covoitId}`;
