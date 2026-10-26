import type { Route } from '../../router.svelte.ts';
// Verso · soute partagée (face nuit) : le marché des droits de bagage d'un vol, revendre mon bagage inutilisé, chercher un bagage. Tous demandent un compte connecté.
// Les deux chemins `/bagages/*` remplacent les pages « Bientôt » réservées par le socle.
const routes: Route[] = [
  { chemin: '/soute/:volId', composant: () => import('./SouteVol.svelte'), titre: 'Soute du vol', acces: 'compte' },
  { chemin: '/bagages/vendre', composant: () => import('./BagageVendre.svelte'), titre: 'Revendre mon bagage inutilisé', acces: 'compte' },
  { chemin: '/bagages/demande', composant: () => import('./BagageDemande.svelte'), titre: 'Chercher un bagage sur ce vol', acces: 'compte' }
];
export default routes;
