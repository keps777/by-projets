// Table des routes : chaque écran est chargé à la demande (découpage du code).
import type { Component } from 'svelte';

export interface Route {
  motif: string;
  /** Écran accessible sans être connecté. */
  public?: boolean;
  charger: () => Promise<{ default: Component<any> }>;
}

export const ROUTES: Route[] = [
  { motif: '/', charger: () => import('./screens/fil/Fil.svelte') },
  { motif: '/action-rapide', charger: () => import('./screens/fil/ActionRapide.svelte') },
  { motif: '/focus', charger: () => import('./screens/fil/Focus.svelte') },
  { motif: '/semaine', charger: () => import('./screens/fil/Semaine.svelte') },
  { motif: '/mois', charger: () => import('./screens/fil/Mois.svelte') },
  { motif: '/recherche', charger: () => import('./screens/fil/Recherche.svelte') },
  { motif: '/tache/nouvelle', charger: () => import('./screens/fil/NouvelleTache.svelte') },
  { motif: '/tache/:id', charger: () => import('./screens/fil/NouvelleTache.svelte') },
  { motif: '/projets', charger: () => import('./screens/projets/Projets.svelte') },
  { motif: '/projets/nouveau-sous-projet', charger: () => import('./screens/projets/NouveauSousProjet.svelte') },
  { motif: '/projets/sous-projet/:id', charger: () => import('./screens/projets/SousProjet.svelte') },
  { motif: '/rapports', charger: () => import('./screens/rapports/Rapports.svelte') },
  { motif: '/rapports/export', charger: () => import('./screens/rapports/Export.svelte') },
  { motif: '/rapports/archives', charger: () => import('./screens/rapports/Archives.svelte') },
  { motif: '/archive', charger: () => import('./screens/archive/Archive.svelte') },
  { motif: '/reglages', charger: () => import('./screens/reglages/Reglages.svelte') },
  { motif: '/connexion', public: true, charger: () => import('./screens/accueil/Connexion.svelte') },
  { motif: '/installer', charger: () => import('./screens/accueil/Installer.svelte') },
  { motif: '/autoriser-notifications', charger: () => import('./screens/accueil/AutoriserNotifications.svelte') }
];

export interface Correspondance { route: Route; params: Record<string, string> }

export function trouverRoute(chemin: string): Correspondance | null {
  const norm = chemin.length > 1 ? chemin.replace(/\/+$/, '') : chemin;
  const segs = norm.split('/');
  for (const route of ROUTES) {
    const m = route.motif.split('/');
    if (m.length !== segs.length) continue;
    const params: Record<string, string> = {};
    if (m.every((s, i) => (s.startsWith(':') ? ((params[s.slice(1)] = decodeURIComponent(segs[i])), true) : s === segs[i]))) return { route, params };
  }
  return null;
}
