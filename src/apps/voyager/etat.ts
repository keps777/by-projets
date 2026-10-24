// Recherche partagée du voyageur (tranche « recherche ») : trajet, jour, filtres, tri, vue. Lue aussi par les autres écrans (siège, paiement, réseau…).
import { ajouterJours, type Jour } from '../../core/dates.ts';
import { filtresVides, type Filtres, type Vue } from '../../core/recherche.ts';
import type { Tri } from '../../core/tranches.ts';
import { app, aujourdhui, tranche } from '../../data/store.svelte.ts';

export interface Recherche extends Filtres {
  de: string; vers: string; jour: Jour; tri: Tri; vue: Vue;
  /** Heure souhaitée (HH:MM) choisie au calendrier ou à la voix : l'accueil met cette tranche en face, une seule fois. */
  heureCible: string | null;
}
export const demain = (): Jour => ajouterJours(aujourdhui(), 1);
export const rechercheParDefaut = (): Recherche => ({ de: 'Yaoundé', vers: 'Douala', jour: demain(), ...filtresVides(), tri: 'heure', vue: '3d', heureCible: null });

/** Crée la tranche si besoin et la remet d'aplomb (champs manquants, jour passé). À appeler depuis un script ou une action, jamais depuis un `$derived`. */
export function initRecherche(): Recherche {
  const r = tranche<Recherche>('recherche', rechercheParDefaut), d = rechercheParDefaut() as unknown as Record<string, unknown>, c = r as unknown as Record<string, unknown>;
  for (const k of Object.keys(d)) if (c[k] === undefined) c[k] = d[k];
  if (r.jour < aujourdhui()) r.jour = demain();
  if (r.de === r.vers) r.vers = r.de === 'Douala' ? 'Yaoundé' : 'Douala';
  return r;
}
/** Lecture seule, sans rien créer (utilisable dans un `$derived`). */
export const lireRecherche = (): Recherche => (app.tranches.recherche as Recherche | undefined) ?? rechercheParDefaut();

export function effacerFiltres(r: Recherche) { Object.assign(r, { ...filtresVides(), genre: r.genre }); }
/** Change le trajet ; l'heure souhaitée précédente n'a plus de sens. */
export function choisirTrajet(r: Recherche, de: string, vers: string) { r.de = de; r.vers = vers; r.heureCible = null; }
export function choisirJour(r: Recherche, jour: Jour, heure: string | null = null) { r.jour = jour; r.heureCible = heure; }
