import type { Route } from '../../router.svelte.ts';
const routes: Route[] = [
  { chemin: '/commerce', composant: () => import('./Encaisser.svelte'), garde: 'connecte', titre: 'Encaisser' },
  { chemin: '/commerce/stock', composant: () => import('./Stock.svelte'), garde: 'connecte', titre: 'Stock et trésorerie' }
];
export default routes;
