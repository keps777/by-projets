import type { Route } from '../../router.svelte.ts';

const patron = ['patron'] as Route['roles'];
export default [
  { chemin: '/patron', composant: () => import('./Patron.svelte'), titre: 'Tableau du patron', roles: patron },
  { chemin: '/patron/equipe', composant: () => import('./Equipe.svelte'), titre: 'Gares et équipes', roles: patron },
  { chemin: '/patron/gare', composant: () => import('./Gare.svelte'), titre: 'Une gare', roles: patron },
  { chemin: '/patron/personne', composant: () => import('./Personne.svelte'), titre: 'Une personne de l’équipe', roles: patron },
  { chemin: '/assistant', composant: () => import('./Assistant.svelte'), titre: 'Assistant du patron', roles: patron },
  { chemin: '/assistant/reponse', composant: () => import('./Reponse.svelte'), titre: 'Réponse de l’assistant', roles: patron },
  { chemin: '/modules', composant: () => import('./Modules.svelte'), titre: 'Modules', roles: patron },
  { chemin: '/financement', composant: () => import('./Financement.svelte'), titre: 'Financement', roles: patron },
  { chemin: '/financement/demande', composant: () => import('./Demande.svelte'), titre: 'Dossier de financement', roles: patron },
  { chemin: '/inter-agences', composant: () => import('./InterAgences.svelte'), titre: 'Inter-agences', roles: patron },
  { chemin: '/inter-agences/convention', composant: () => import('./Convention.svelte'), titre: 'Convention inter-agences', roles: patron }
] satisfies Route[];
