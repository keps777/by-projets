// Routeur minimal par History API. Chaque écran se déclare dans le `routes.ts` de son dossier (voir CONTRIBUER.md).
import type { Component } from 'svelte';
import type { Role } from './domain/types.ts';

export interface Route {
  /** Chemin, avec paramètres `:id` éventuels. */
  chemin: string;
  composant: () => Promise<{ default: Component<any> }>;
  /** `mobile` : écran 390 px sombre (voyageur et agents) ; `web` : application du siège (pleine largeur) ; `plein` : mobile sans barre (onboarding, scan…). */
  cadre?: 'mobile' | 'web' | 'plein';
  /** Rôles autorisés ; absent = public. Un rôle absent de la liste est redirigé vers /entree. */
  roles?: Role[];
  /** Onglet du dock voyageur à surligner (barre du bas). */
  onglet?: 'voyager' | 'billets' | 'direct' | 'moi';
  titre: string;
}

export const routeur = $state({ chemin: location.pathname, recherche: location.search, historique: 0 });

function sync() { routeur.chemin = location.pathname; routeur.recherche = location.search; }
window.addEventListener('popstate', sync);

export function aller(vers: string, { remplacer = false }: { remplacer?: boolean } = {}) {
  if (vers === location.pathname + location.search) return;
  (remplacer ? history.replaceState : history.pushState).call(history, { n: ++routeur.historique }, '', vers);
  sync();
  window.scrollTo(0, 0);
}
export function retour(secours = '/') { if (routeur.historique > 0 || history.length > 1) history.back(); else aller(secours, { remplacer: true }); }
export const param = (nom: string) => new URLSearchParams(routeur.recherche).get(nom);

/** Associe un chemin à une route, en extrayant les paramètres `:id`. */
export function resoudre(routes: Route[], chemin: string): { route: Route; params: Record<string, string> } | null {
  const propre = chemin.replace(/\/+$/, '') || '/';
  for (const route of routes) {
    const motif = route.chemin.split('/'); const reel = propre.split('/');
    if (motif.length !== reel.length) continue;
    const params: Record<string, string> = {};
    if (motif.every((m, i) => (m.startsWith(':') ? ((params[m.slice(1)] = decodeURIComponent(reel[i])), true) : m === reel[i]))) return { route, params };
  }
  return null;
}

/** Toutes les routes déclarées par les dossiers `src/apps/*`. */
const modules = import.meta.glob<{ default: Route[] }>('./apps/*/routes.ts', { eager: true });
export const ROUTES: Route[] = Object.values(modules).flatMap((m) => m.default);
