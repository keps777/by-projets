import type { Route } from '../../router.svelte.ts';
// Soute partagée d'un même vol : mes bagages, ajouter des bagages (même vol), transfert confirmé. Tous demandent un compte connecté.
// `/bagages/vendre` et `/bagages/demande` (verso) sont réservées dans `apps/_socle/reservees.ts` jusqu'à leur construction.
const routes: Route[] = [
  { chemin: '/bagages', composant: () => import('./Bagages.svelte'), titre: 'Mes bagages', acces: 'compte' },
  { chemin: '/bagages/ajouter', composant: () => import('./Ajouter.svelte'), titre: 'Ajouter des bagages', acces: 'compte' },
  { chemin: '/bagages/transfere', composant: () => import('./Transfere.svelte'), titre: 'Bagage transféré', acces: 'compte' }
];
export default routes;
