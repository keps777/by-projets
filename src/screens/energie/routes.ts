import type { Route } from '../../router.svelte.ts';
const routes: Route[] = [{ chemin: '/energie', composant: () => import('./Solaire.svelte'), garde: 'connecte', titre: 'Énergie solaire' }];
export default routes;
