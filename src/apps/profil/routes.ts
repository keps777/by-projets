import type { Route } from '../../router.svelte.ts';
// Parcours après l'accès : étapes 2 à 4 de l'inscription, carte et identité facultatives, écran « prêt ». Tous demandent un compte connecté.
const routes: Route[] = [
  { chemin: '/profil', composant: () => import('./Profil.svelte'), titre: 'Étape 2 · faisons connaissance', acces: 'compte' },
  { chemin: '/partage', composant: () => import('./Partage.svelte'), titre: 'Étape 3 · vos choix de partage', acces: 'compte' },
  { chemin: '/bienvenue-notifications', composant: () => import('./Notifications.svelte'), titre: 'Étape 4 · notifications', acces: 'compte' },
  { chemin: '/carte', composant: () => import('./Carte.svelte'), titre: 'Carte de paiement, facultative', acces: 'compte' },
  { chemin: '/identite', composant: () => import('./Identite.svelte'), titre: 'Identité, seulement quand il le faut', acces: 'compte' },
  { chemin: '/pret', composant: () => import('./Pret.svelte'), titre: 'Votre espace est prêt', acces: 'compte' }
];
export default routes;
