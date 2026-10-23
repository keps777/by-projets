import type { Route } from '../../router.svelte.ts';

const routes: Route[] = [
  { chemin: '/auto', composant: () => import('./Accueil.svelte'), garde: 'connecte', titre: 'Mobilité' },
  { chemin: '/auto/catalogue', composant: () => import('./Catalogue.svelte'), garde: 'connecte', titre: 'Catalogue véhicules' },
  { chemin: '/auto/simulation', composant: () => import('./Simulation.svelte'), garde: 'connecte', titre: 'Simulation crédit auto' },
  { chemin: '/auto/decision', composant: () => import('./Decision.svelte'), garde: 'connecte', titre: 'Décision crédit auto' },
  { chemin: '/auto/contrat', composant: () => import('./Contrat.svelte'), garde: 'connecte', titre: 'Contrat de financement' },
  { chemin: '/auto/livraison', composant: () => import('./Livraison.svelte'), garde: 'connecte', titre: 'Livraison du véhicule' }
];
export default routes;
