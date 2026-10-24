import type { Route } from '../../router.svelte.ts';
export default [
  { chemin: '/', composant: () => import('./Accueil.svelte'), titre: 'Voyager', roles: ['voyageur'], onglet: 'voyager' },
  { chemin: '/filtres', composant: () => import('./Filtres.svelte'), titre: 'Filtres', roles: ['voyageur'], onglet: 'voyager' },
  { chemin: '/ville', composant: () => import('./Ville.svelte'), titre: 'En ville', roles: ['voyageur'], onglet: 'voyager' },
  { chemin: '/voix', composant: () => import('./Voix.svelte'), titre: 'Dis où tu vas', roles: ['voyageur'], onglet: 'voyager' },
  { chemin: '/orbe', composant: () => import('./Orbe.svelte'), titre: 'Toutes les actions', roles: ['voyageur'], cadre: 'plein' },
  { chemin: '/destination', composant: () => import('./Destination.svelte'), titre: 'Destination', roles: ['voyageur'], onglet: 'voyager' },
  { chemin: '/calendrier', composant: () => import('./Calendrier.svelte'), titre: 'Date et heure', roles: ['voyageur'], onglet: 'voyager' }
] satisfies Route[];
