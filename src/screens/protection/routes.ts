import type { Route } from '../../router.svelte.ts';
const routes: Route[] = [{ chemin: '/protection', composant: () => import('./Protection.svelte'), garde: 'connecte', titre: 'Protection famille' }];
export default routes;
