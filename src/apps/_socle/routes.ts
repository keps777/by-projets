import type { Route } from '../../router.svelte.ts';
export default [
  { chemin: '/entree', composant: () => import('./Entree.svelte'), titre: 'Entrée' }
] satisfies Route[];
