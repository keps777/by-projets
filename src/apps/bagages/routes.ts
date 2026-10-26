import type { Route } from '../../router.svelte.ts';
// Soute partagée d'un même vol : mes bagages, ajouter des bagages (même vol), transfert confirmé. Tous demandent un compte connecté.
// `/bagages/vendre` et `/bagages/demande` sont les écrans du verso (vendre ma franchise, publier une demande) : la page « Bientôt » tient leur place.
const routes: Route[] = [
  { chemin: '/bagages', composant: () => import('./Bagages.svelte'), titre: 'Mes bagages', acces: 'compte' },
  { chemin: '/bagages/ajouter', composant: () => import('./Ajouter.svelte'), titre: 'Ajouter des bagages', acces: 'compte' },
  { chemin: '/bagages/transfere', composant: () => import('./Transfere.svelte'), titre: 'Bagage transféré', acces: 'compte' },
  { chemin: '/bagages/vendre', composant: () => import('../_socle/Bientot.svelte'), titre: 'Revendre un bagage', acces: 'compte' },
  { chemin: '/bagages/demande', composant: () => import('../_socle/Bientot.svelte'), titre: 'Demander un bagage', acces: 'compte' }
];
export default routes;
