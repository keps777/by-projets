import type { Route } from '../../router.svelte.ts';
const roles: Route['roles'] = ['superviseur'];
export default [
  { chemin: '/superviseur', composant: () => import('./Gare.svelte'), titre: 'La gare en direct', roles },
  { chemin: '/superviseur/voir', composant: () => import('./Voir.svelte'), titre: 'Décider une annulation', roles },
  { chemin: '/superviseur/valider', composant: () => import('./Valider.svelte'), titre: 'Valider une clôture', roles },
  { chemin: '/superviseur/equipe', composant: () => import('./Equipe.svelte'), titre: 'Équipe de la gare', roles },
  { chemin: '/superviseur/debloquer', composant: () => import('./Debloquer.svelte'), titre: 'Débloquer un guichet', roles },
  { chemin: '/superviseur/moi', composant: () => import('./Moi.svelte'), titre: 'Mon espace superviseur', roles },
  { chemin: '/rapport-soir', composant: () => import('./RapportSoir.svelte'), titre: 'Rapport du soir', roles }
] satisfies Route[];
