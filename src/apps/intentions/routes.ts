import type { Route } from '../../router.svelte.ts';
// « Dire son prix » : publier une intention d'achat, réserver les fonds, suivre ses intentions, répondre à une proposition, accord conclu. Tous demandent un compte connecté.
const routes: Route[] = [
  { chemin: '/intention/nouvelle', composant: () => import('./Creer.svelte'), titre: 'Dites votre prix', acces: 'compte' },
  { chemin: '/intention/fonds', composant: () => import('./Fonds.svelte'), titre: 'Réserver les fonds', acces: 'compte' },
  { chemin: '/intentions', composant: () => import('./Liste.svelte'), titre: 'Mes intentions', acces: 'compte' },
  { chemin: '/intentions/:id/proposition/:pid', composant: () => import('./Proposition.svelte'), titre: 'Proposition reçue', acces: 'compte' },
  { chemin: '/intentions/:id/accord', composant: () => import('./Accord.svelte'), titre: 'Accord conclu', acces: 'compte' }
];
export default routes;
