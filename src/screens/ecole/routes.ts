import type { Route } from '../../router.svelte.ts';

const routes: Route[] = [
  { chemin: '/ecole', composant: () => import('./Ecole.svelte'), garde: 'connecte', titre: 'Éducation' },
  { chemin: '/ecole/frais', composant: () => import('./Frais.svelte'), garde: 'connecte', titre: 'Frais de rentrée' },
  { chemin: '/ecole/plan', composant: () => import('./Plan.svelte'), garde: 'connecte', titre: 'Plan de paiement' },
  { chemin: '/ecole/bulletin/:enfant', composant: () => import('./Bulletin.svelte'), garde: 'connecte', titre: 'Bulletin' }
];
export default routes;
