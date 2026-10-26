import type { Route } from '../../router.svelte.ts';
// Console d'administration (PC) : entrée publique de démonstration, puis quatre écrans réservés au compte `admin` (accès `admin`).
const routes: Route[] = [
  { chemin: '/admin', composant: () => import('./Entree.svelte'), titre: 'Administration', acces: 'public' },
  { chemin: '/admin/droits', composant: () => import('./Droits.svelte'), titre: 'Droits de voyage', acces: 'admin' },
  { chemin: '/admin/droits/:id', composant: () => import('./Chaine.svelte'), titre: 'Chaîne de détention', acces: 'admin' },
  { chemin: '/admin/drops', composant: () => import('./Drops.svelte'), titre: 'Drops et agences', acces: 'admin' },
  { chemin: '/admin/audit', composant: () => import('./Audit.svelte'), titre: 'Journal d’audit', acces: 'admin' }
];
export default routes;
