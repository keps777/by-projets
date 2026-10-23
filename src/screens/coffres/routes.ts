import type { Route } from '../../router.svelte.ts';

// `/coffres/nouveau` doit précéder `/coffres/:id`.
const routes: Route[] = [
  { chemin: '/coffres', composant: () => import('./Coffres.svelte'), garde: 'connecte', onglet: 'coffres', titre: 'Coffres' },
  { chemin: '/coffres/nouveau', composant: () => import('./Creer.svelte'), garde: 'connecte', onglet: 'coffres', titre: 'Nouveau coffre' },
  { chemin: '/coffres/:id', composant: () => import('./Detail.svelte'), garde: 'connecte', onglet: 'coffres', titre: 'Coffre' }
];
export default routes;
