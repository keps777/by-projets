import type { Route } from '../../router.svelte.ts';
import './demarrage.ts';
// Verso · Mes actifs, côté marché (face nuit) : cours et carnet d'ordres, ordre à cours limité, vendre ou attendre, revendre, intentions d'achat côté vendeur.
// Les paramètres gardent les noms des routes réservées (`:id`) pour les remplacer.
const routes: Route[] = [
  { chemin: '/cours/:id', composant: () => import('./Cours.svelte'), titre: 'Cours du vol', acces: 'compte' },
  { chemin: '/ordre/:id', composant: () => import('./Ordre.svelte'), titre: 'Ordre à cours limité', acces: 'compte' },
  { chemin: '/liquidite/:id', composant: () => import('./Liquidite.svelte'), titre: 'Vendre ou attendre', acces: 'compte' },
  { chemin: '/revendre/:id', composant: () => import('./Revendre.svelte'), titre: 'Revendre', acces: 'compte' },
  { chemin: '/marche-intentions', composant: () => import('./Demandes.svelte'), titre: 'Intentions d’achat', acces: 'compte' },
  { chemin: '/marche-intentions/proposer/:intentionId', composant: () => import('./Proposer.svelte'), titre: 'Proposer mon billet', acces: 'compte' },
  { chemin: '/marche-intentions/issue/:intentionId', composant: () => import('./Issue.svelte'), titre: 'Issue de la proposition', acces: 'compte' }
];
export default routes;
