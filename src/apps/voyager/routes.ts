import type { Route } from '../../router.svelte.ts';
// Recto · Voyager : l'accueil double face (avec compte, et en version réduite sans compte), le radar des destinations et les reventes de la semaine.
const routes: Route[] = [
  { chemin: '/', composant: () => import('./Accueil.svelte'), titre: 'Accueil', acces: 'compte' },
  { chemin: '/explorer', composant: () => import('./Accueil.svelte'), titre: 'Explorer', acces: 'public' },
  { chemin: '/radar', composant: () => import('./Radar.svelte'), titre: 'Explorer — radar des destinations', acces: 'public' },
  { chemin: '/revente', composant: () => import('./Revente.svelte'), titre: 'Ces billets cherchent un voyageur', acces: 'public' }
];
export default routes;
