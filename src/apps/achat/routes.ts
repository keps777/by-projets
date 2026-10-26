import type { Route } from '../../router.svelte.ts';
// Parcours d'achat puis de préparation du voyage (recto · Voyager, face jour). Tous demandent un compte connecté (garde de l'application).
const routes: Route[] = [
  { chemin: '/paiement/:offreId', composant: () => import('./Paiement.svelte'), titre: 'Paiement (démo)', acces: 'compte' },
  { chemin: '/confirmation/:droitId', composant: () => import('./Confirmation.svelte'), titre: 'Confirmation', acces: 'compte' },
  { chemin: '/voyage/:droitId', composant: () => import('./Voyage.svelte'), titre: 'Mon voyage', acces: 'compte' },
  { chemin: '/nommer/:droitId', composant: () => import('./Nommer.svelte'), titre: 'Nommer le voyageur', acces: 'compte' },
  { chemin: '/pret-a-voyager/:droitId', composant: () => import('./PretAVoyager.svelte'), titre: 'Prêt à voyager', acces: 'compte' }
];
export default routes;
