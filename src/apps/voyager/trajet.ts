// Fenêtre « Où vas-tu ? » : logique du trajet (états des villes sur la carte, textes, clavier, validation). Sans composant : testable seul.
import { jourSemaineCourt, type Jour } from '../../core/dates.ts';
import { VILLES_CARTE, villeCarte, type Cote } from '../../core/cameroun.ts';
import { fmtF } from '../../core/tarif.ts';
import { duree } from '../../core/tranches.ts';
import { app } from '../../data/store.svelte.ts';
import { gare } from '../../domain/actions.ts';
import { choisirJour, choisirTrajet, type Recherche } from './etat.ts';
import type { Destination } from './offres.ts';

/** `depart` : la ville de départ (étoile) ; `choisie` : l'arrivée choisie ; `desservie` : on peut y aller depuis le départ ; `grisee` : aucune ligne. */
export type EtatVille = 'depart' | 'choisie' | 'desservie' | 'grisee';
export interface PointVille { nom: string; lon: number; lat: number; cote: Cote; etat: EtatVille; destination?: Destination }
export const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** Toutes les villes de la carte avec leur état par rapport au départ et à l'arrivée choisies. */
export function pointsCarte(de: string, vers: string | null, dests: Destination[]): PointVille[] {
  return VILLES_CARTE.map((v) => {
    const destination = dests.find((d) => d.ville === v.nom);
    const etat: EtatVille = v.nom === de ? 'depart' : v.nom === vers && destination ? 'choisie' : destination ? 'desservie' : 'grisee';
    return { ...v, etat, destination };
  });
}
/** Villes desservies qui ont un point sur la carte, dans l'ordre des propositions. */
export const desservies = (dests: Destination[]): Destination[] => dests.filter((d) => villeCarte(d.ville));

const insec = (t: string) => t.replace(/ /g, '\u00a0');
const prixDes = (d: Destination) => (d.prix === null ? 'aucun départ ce jour-là' : insec(`dès ${fmtF(d.prix)}`));
/** « Pour aller à Douala : 5 compagnies · dès 5 000 F · 3 h 15 » */
export const infoVille = (d: Destination) => `Pour aller à ${d.ville} : ${pluriel(d.compagnies, 'compagnie')} · ${prixDes(d)} · ${insec(duree(d.dureeMin))}`;
/** Sous-titre d'une proposition de destination. */
export const sousDestination = (d: Destination) => `${pluriel(d.compagnies, 'compagnie')} · gare ${d.gares.join(' / ')}`;
export const prixEtDuree = (d: Destination) => ({ prix: prixDes(d), duree: duree(d.dureeMin) });
/** Message quand la paire n'a aucune ligne : on dit lesquelles existent depuis le départ. */
export function infoSansLigne(de: string, vers: string, dests: Destination[]): string {
  const noms = dests.map((d) => d.ville);
  return `Pas encore de ligne ${de} → ${vers}.${noms.length ? ` Villes desservies depuis ${de} : ${noms.join(', ')}.` : ` Aucune ligne ne part de ${de} pour l’instant.`}`;
}
export const infoInvite = (de: string, nb: number) => nb ? `Touche une ville allumée pour tracer ton trajet depuis ${de}.` : `Aucune ligne ne part de ${de} pour l’instant : change de ville de départ.`;
/** « Mvan » ou « Mvan +1 » : gares d'une ville (la première, puis le nombre d'autres). */
export const texteGares = (gares: string[]) => (gares.length > 1 ? `${gares[0]} +${gares.length - 1}` : (gares[0] ?? '—'));
/** Gares de départ d'une ligne (ou de toutes les lignes au départ de `de` quand `vers` est inconnu), sans doublon. */
export function garesDepart(de: string, vers: string | null): string[] {
  const ls = app.monde.lignes.filter((l) => l.actif && l.de === de && (!vers || l.vers === vers));
  return [...new Set(ls.map((l) => gare(l.gareDe)?.nom ?? '').filter(Boolean))];
}
/** Existe-t-il une ligne `a → b` ? (pour l'échangeur ⇅) */
export const ligneExiste = (a: string, b: string) => app.monde.lignes.some((l) => l.actif && l.de === a && l.vers === b);

/** « sam. 28 nov. · 08:00 » ou « … · toute la journée ». */
export const libelleDate = (jour: Jour, heure: string | null) => `${jourSemaineCourt(jour)} · ${heure ?? 'toute la journée'}`;
/** Tranches de trois heures (« 00 – 03 h » … « 21 – 24 h ») et l'heure de début à retenir. */
export const TRANCHES_3H = Array.from({ length: 8 }, (_, i) => ({ debut: `${String(i * 3).padStart(2, '0')}:00`, libelle: `${String(i * 3).padStart(2, '0')}–${String(i * 3 + 3).padStart(2, '0')} h` }));
/** La tranche de 3 h qui contient l'heure donnée (index 0 à 7), ou -1 sans heure. */
export const trancheDe = (heure: string | null) => (heure ? Math.floor(Number(heure.slice(0, 2)) / 3) : -1);

/** Ville suivante ou précédente dans une liste circulaire selon la touche fléchée (↓ → : suivante ; ↑ ← : précédente ; Début, Fin). null pour toute autre touche. */
export function voisine(noms: string[], courant: string | null, touche: string): string | null {
  if (!noms.length) return null;
  const i = courant ? noms.indexOf(courant) : -1;
  if (touche === 'Home') return noms[0];
  if (touche === 'End') return noms[noms.length - 1];
  if (touche === 'ArrowDown' || touche === 'ArrowRight') return noms[i < 0 ? 0 : (i + 1) % noms.length];
  if (touche === 'ArrowUp' || touche === 'ArrowLeft') return noms[i < 0 ? noms.length - 1 : (i - 1 + noms.length) % noms.length];
  return null;
}

/** Où poser le haut de la fenêtre : au niveau de la ligne de trajet qui l'a ouverte (`rect`), sans sortir de l'écran ; `repli` si on ne sait pas d'où l'on vient. */
export function haut(rect: { top: number; bottom: number } | null, hauteurEcran: number, repli = 108, mini = 8, minHauteur = 440): number {
  const t = rect ? rect.top - 6 : repli;
  return Math.round(Math.max(mini, Math.min(t, hauteurEcran - minHauteur)));
}

/** Valide le trajet : écrit le départ, l'arrivée, le jour et l'heure souhaitée dans la recherche partagée. */
export function appliquerTrajet(r: Recherche, de: string, vers: string, jour: Jour, heure: string | null) {
  choisirTrajet(r, de, vers); choisirJour(r, jour, heure);
}

/** Les animations infinies (pulsations, flux de l'arc, trajet du point) sont figées pour l'automatisation des tests (navigator.webdriver). */
export const animationsFigees = (): boolean => typeof navigator !== 'undefined' && navigator.webdriver === true;
/** L'utilisateur a demandé moins de mouvement. */
export const mouvementReduit = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
