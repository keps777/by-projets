import type { Route } from '../../router.svelte.ts';
// Transférer un droit à un proche (verso · Mes actifs, face nuit) : choisir le proche, proche sans compte, confirmer, échéance proche, transfert effectué, erreur.
// Tous demandent un compte connecté. `/transferer/:droitId` remplace la page « Bientôt » réservée `/transferer/:id`.
const routes: Route[] = [
  { chemin: '/transferer/:droitId', composant: () => import('./Choisir.svelte'), titre: 'Transférer à un proche', acces: 'compte' },
  { chemin: '/transferer/:droitId/sans-compte', composant: () => import('./SansCompte.svelte'), titre: 'Proche sans compte', acces: 'compte' },
  { chemin: '/transferer/:droitId/confirmer', composant: () => import('./Confirmer.svelte'), titre: 'Confirmer le transfert', acces: 'compte' },
  { chemin: '/transferer/:droitId/echeance', composant: () => import('./Echeance.svelte'), titre: 'Transfert : échéance proche', acces: 'compte' },
  { chemin: '/transferer/:droitId/fait', composant: () => import('./Fait.svelte'), titre: 'Transfert effectué', acces: 'compte' },
  { chemin: '/transferer/:droitId/erreur', composant: () => import('./Erreur.svelte'), titre: 'Transfert non effectué', acces: 'compte' }
];
export default routes;
