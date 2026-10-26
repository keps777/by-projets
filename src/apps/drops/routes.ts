import type { Route } from '../../router.svelte.ts';
// Drops membres (verso · Mes actifs, onglet « Drops ») : le drop en direct et, sur la même route, l'écran « épuisé / terminé ».
// Public : on peut voir le drop sans compte (prix masqué, invitation au Pass) ; réserver demande le Pass.
const routes: Route[] = [
  { chemin: '/drops', composant: () => import('./Drops.svelte'), titre: 'Drops membres', acces: 'public' }
];
export default routes;
