import type { Route } from '../../router.svelte.ts';
// Routes du socle : l'accueil provisoire (remplacé par l'accueil double face à la phase « recto »), l'annuaire des écrans et la page introuvable.
const routes: Route[] = [
  { chemin: '/', composant: () => import('./AccueilProvisoire.svelte'), titre: 'Accueil' },
  { chemin: '/explorer', composant: () => import('./AccueilProvisoire.svelte'), titre: 'Explorer', acces: 'public' },
  { chemin: '/prive', composant: () => import('./Prive.svelte'), titre: 'Zone privée' },
  { chemin: '/ecrans', composant: () => import('./Annuaire.svelte'), titre: 'Tous les écrans', acces: 'public' }
];
export default routes;
