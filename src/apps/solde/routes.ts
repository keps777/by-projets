import type { Route } from '../../router.svelte.ts';
// Solde NexG et grand livre (verso, face nuit). Demande un compte.
const routes: Route[] = [
  { chemin: '/solde', composant: () => import('./Solde.svelte'), titre: 'Solde NexG', acces: 'compte' }
];
export default routes;
