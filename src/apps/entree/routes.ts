import type { Route } from '../../router.svelte.ts';
// Entrée : le panneau qui tourne, la langue et la région, les trois promesses. Écrans publics.
const routes: Route[] = [
  { chemin: '/ouverture', composant: () => import('./Ouverture.svelte'), titre: 'Ouverture', acces: 'public' },
  { chemin: '/langue', composant: () => import('./Langue.svelte'), titre: 'Langue et région', acces: 'public' },
  { chemin: '/promesses', composant: () => import('./Promesses.svelte'), titre: 'Ce que vous pouvez faire', acces: 'public' }
];
export default routes;
