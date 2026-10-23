import type { Route } from '../../router.svelte.ts';

const routes: Route[] = [
  { chemin: '/score', composant: () => import('./Score.svelte'), garde: 'connecte', onglet: 'score', titre: 'AssureScore' },
  { chemin: '/score/conseils', composant: () => import('./Conseils.svelte'), garde: 'connecte', onglet: 'score', titre: 'Gagner des points' },
  { chemin: '/score/carte', composant: () => import('./MaCarte.svelte'), garde: 'connecte', onglet: 'score', titre: 'Ma carte AssureScore' }
];
export default routes;
