import type { Route } from '../../router.svelte.ts';

const routes: Route[] = [
  { chemin: '/portail/entreprise/inscription', composant: () => import('./Inscription.svelte'), cadre: 'portail', titre: 'Inscription entreprise' },
  { chemin: '/portail/entreprise', composant: () => import('./Tableau.svelte'), cadre: 'portail', titre: 'Espace employeur' }
];
export default routes;
