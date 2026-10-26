import type { Route } from '../../router.svelte.ts';
// Verso · Mes actifs (face nuit) : portefeuille, droit de voyage (billet recto/verso), calendrier des échéances, import d'un billet externe, indices NexG. Tous demandent un compte connecté.
const routes: Route[] = [
  { chemin: '/portefeuille', composant: () => import('./Portefeuille.svelte'), titre: 'Portefeuille', acces: 'compte' },
  { chemin: '/droit/:droitId', composant: () => import('./Droit.svelte'), titre: 'Mon droit de voyage', acces: 'compte' },
  { chemin: '/echeances', composant: () => import('./Echeances.svelte'), titre: 'Échéances', acces: 'compte' },
  { chemin: '/importer', composant: () => import('./Importer.svelte'), titre: 'Importer un billet', acces: 'compte' },
  { chemin: '/indices', composant: () => import('./Indices.svelte'), titre: 'Indices NexG', acces: 'compte' }
];
export default routes;
