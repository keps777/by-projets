import type { Route } from '../../router.svelte.ts';
const routes: Route[] = [
  { chemin: '/diaspora', composant: () => import('./Payer.svelte'), garde: 'connecte', titre: 'Payer pour un proche' },
  { chemin: '/diaspora/suivi', composant: () => import('./Suivi.svelte'), garde: 'connecte', titre: 'Suivi du paiement' },
  { chemin: '/diaspora/suivi/:id', composant: () => import('./Suivi.svelte'), garde: 'connecte', titre: 'Suivi du paiement' }
];
export default routes;
