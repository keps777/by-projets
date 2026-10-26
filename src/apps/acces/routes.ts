import type { Route } from '../../router.svelte.ts';
// Accès : créer un compte, code de vérification, retour d'un compte existant (clé d'accès). Tous publics.
const routes: Route[] = [
  { chemin: '/inscription', composant: () => import('./Inscription.svelte'), titre: 'Créer un compte', acces: 'public' },
  { chemin: '/code', composant: () => import('./Code.svelte'), titre: 'Code de vérification', acces: 'public' },
  { chemin: '/connexion', composant: () => import('./Connexion.svelte'), titre: 'Connexion', acces: 'public' }
];
export default routes;
