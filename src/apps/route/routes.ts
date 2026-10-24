import type { Route } from '../../router.svelte.ts';
// Suivi du bus, retard, réseau en direct, course vers la gare, montée en route, covoiturage. Toutes réservées à la voyageuse.
export default [
  { chemin: '/direct', composant: () => import('./Direct.svelte'), titre: 'Mon bus en direct', roles: ['voyageur'], onglet: 'direct' },
  { chemin: '/direct/ilot', composant: () => import('./DirectIlot.svelte'), titre: 'Îlot dynamique', roles: ['voyageur'], onglet: 'direct', cadre: 'plein' },
  { chemin: '/direct/retard', composant: () => import('./DirectRetard.svelte'), titre: 'Retard annoncé', roles: ['voyageur'], onglet: 'direct' },
  { chemin: '/reseau', composant: () => import('./Reseau.svelte'), titre: 'Le réseau en direct', roles: ['voyageur'], onglet: 'direct' },
  { chemin: '/course', composant: () => import('./Course.svelte'), titre: 'Moto ou taxi vers la gare', roles: ['voyageur'], onglet: 'voyager' },
  { chemin: '/arret', composant: () => import('./Arret.svelte'), titre: 'Monter en route', roles: ['voyageur'], onglet: 'voyager' },
  { chemin: '/covoit', composant: () => import('./Covoit.svelte'), titre: 'Covoiturage', roles: ['voyageur'], onglet: 'voyager' },
  { chemin: '/covoit/ville', composant: () => import('./CovoitVille.svelte'), titre: 'Covoiturage en ville', roles: ['voyageur'], onglet: 'voyager' },
  { chemin: '/covoit/conduire', composant: () => import('./CovoitConducteur.svelte'), titre: 'Je conduis', roles: ['voyageur', 'conducteur'], onglet: 'voyager' }
] satisfies Route[];
