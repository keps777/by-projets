import type { Route } from '../../router.svelte.ts';
// Routes du socle : la zone privée de test, l'annuaire des écrans et la page introuvable. (L'accueil `/` et `/explorer` vivent dans `apps/voyager`.)
const routes: Route[] = [
  { chemin: '/prive', composant: () => import('./Prive.svelte'), titre: 'Zone privée' },
  { chemin: '/ecrans', composant: () => import('./Annuaire.svelte'), titre: 'Tous les écrans', acces: 'public' }
];
export default routes;
