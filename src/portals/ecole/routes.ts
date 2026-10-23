import type { Route } from '../../router.svelte.ts';

const routes: Route[] = [{ chemin: '/portail/ecole', composant: () => import('./Portail.svelte'), cadre: 'portail', titre: 'Portail école' }];
export default routes;
