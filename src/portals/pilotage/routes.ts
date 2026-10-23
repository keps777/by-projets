import type { Route } from '../../router.svelte.ts';

const routes: Route[] = [{ chemin: '/portail/pilotage', composant: () => import('./Portail.svelte'), cadre: 'portail', garde: 'public', titre: 'Pilotage' }];
export default routes;
