// Navigation PC (≥ 900 px) : les liens de chaque face, et la recherche rapide de l'en-tête (ville, code d'aéroport, référence NXG).
import type { Monde } from '../domain/types.ts';
export interface LienPc { label: string; href: string; icone: string; actif: boolean }
const sans = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Prochain droit non voyagé du compte (le plus proche), pour « Mon voyage ». */
function prochainDroit(monde: Monde, compteId: string | undefined): string | undefined {
  if (!compteId) return undefined;
  const dep = (volId: string) => { const v = monde.vols.find((x) => x.id === volId); return v ? Date.parse(`${v.jour}T${v.heureDepart}`) : Infinity; };
  return monde.droits.filter((d) => d.detenteurId === compteId && ['detenu', 'nomme', 'en_vente'].includes(d.statut)).sort((a, b) => dep(a.volId) - dep(b.volId))[0]?.id;
}
/** Face jour : Accueil · Rechercher · Mon voyage · Agences. Face nuit : Marché · Drops · Portefeuille · Agences. L'onglet actif se déduit du chemin. */
export function liensPcDe(face: 'jour' | 'nuit', monde: Monde, compteId: string | undefined, chemin: string): LienPc[] {
  const voyage = prochainDroit(monde, compteId);
  const est = (...p: string[]) => p.some((x) => chemin === x || chemin.startsWith(x + '/'));
  if (face === 'jour') return [
    { label: 'Accueil', href: '/', icone: 'accueil', actif: chemin === '/' || chemin === '/explorer' || est('/radar', '/revente') },
    { label: 'Rechercher', href: '/rechercher', icone: 'chercher', actif: est('/rechercher', '/resultats', '/offre') },
    { label: 'Mon voyage', href: voyage ? `/voyage/${voyage}` : '/portefeuille', icone: 'avion', actif: est('/voyage', '/nommer', '/pret-a-voyager', '/bagages', '/confirmation', '/paiement') },
    { label: 'Agences', href: '/agence/horizon', icone: 'sac', actif: est('/agence') }
  ];
  return [
    { label: 'Marché', href: '/resultats?de=YUL&vers=CDG&jour=2026-12-18&n=1', icone: 'echange', actif: est('/resultats', '/cours', '/ordre', '/marche-intentions', '/indices', '/offre') },
    { label: 'Drops', href: '/drops', icone: 'drops', actif: est('/drops') },
    { label: 'Portefeuille', href: '/portefeuille', icone: 'portefeuille', actif: est('/portefeuille', '/droit', '/revendre', '/liquidite', '/transferer', '/echeances', '/importer', '/solde', '/soute') },
    { label: 'Agences', href: '/agence/horizon', icone: 'sac', actif: est('/agence') }
  ];
}
/** Où mène une saisie de la recherche de l'en-tête : une référence NXG-… ouvre son droit, un code ou une ville ouvre les résultats vers cet aéroport, sinon le formulaire. */
export function rechercheRapide(saisie: string, monde: Monde, compteId?: string): string {
  const s = saisie.trim(); if (!s) return '/rechercher';
  const ref = s.toUpperCase().replace(/\s/g, '');
  const d = monde.droits.find((x) => x.ref === ref || x.ref === `NXG-${ref}`);
  if (d) return d.detenteurId === compteId ? `/droit/${d.id}` : '/rechercher';
  const n = sans(s); const a = monde.aeroports.find((x) => x.code.toLowerCase() === n || sans(x.ville) === n || sans(x.ville).startsWith(n));
  if (a && a.code !== 'YUL') return `/resultats?de=YUL&vers=${a.code}&n=1`;
  return '/rechercher';
}

import { app } from '../data/store.svelte.ts';
/** Liens PC d'une face avec le monde courant. */
export const liensPc = (face: 'jour' | 'nuit', compteId: string | undefined, chemin: string): LienPc[] => liensPcDe(face, app.monde, compteId, chemin);
