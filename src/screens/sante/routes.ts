import type { Route } from '../../router.svelte.ts';

const routes: Route[] = [
  { chemin: '/sante', composant: () => import('./Sante.svelte'), garde: 'connecte', onglet: 'accueil', titre: 'Santé' },
  { chemin: '/sante/facture/:id', composant: () => import('./Facture.svelte'), garde: 'connecte', titre: 'Facture santé' }
];
export default routes;
