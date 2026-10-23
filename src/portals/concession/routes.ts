import type { Route } from '../../router.svelte.ts';

const routes: Route[] = [
  { chemin: '/portail/concession', composant: () => import('./Portail.svelte'), cadre: 'portail', titre: 'Portail concessionnaire' }
];
export default routes;
