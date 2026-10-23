import type { Route } from '../../router.svelte.ts';

const routes: Route[] = [{ chemin: '/portail/hopital', composant: () => import('./Portail.svelte'), cadre: 'portail', garde: 'public', titre: 'Portail hôpital' }];
export default routes;
