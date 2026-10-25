import type { Route } from '../../router.svelte.ts';
// Suivi du bus, retard, réseau en direct, course vers la gare, montée en route, covoiturage. Toutes réservées à la voyageuse.
export default [
  { chemin: '/direct', composant: () => import('./Direct.svelte'), titre: 'Mon bus en direct', roles: ['voyageur'], onglet: 'direct' },
  { chemin: '/direct/ilot', composant: () => import('./DirectIlot.svelte'), titre: 'Îlot dynamique', roles: ['voyageur'], onglet: 'direct', cadre: 'plein' },
  { chemin: '/direct/retard', composant: () => import('./DirectRetard.svelte'), titre: 'Retard annoncé', roles: ['voyageur'], onglet: 'direct' },
  { chemin: '/reseau', composant: () => import('./Reseau.svelte'), titre: 'Le réseau en direct', roles: ['voyageur'], onglet: 'direct' },
  { chemin: '/course', composant: () => import('./Course.svelte'), titre: 'Moto ou taxi vers la gare', roles: ['voyageur'], onglet: 'voyager' },
  { chemin: '/arret', composant: () => import('./Arret.svelte'), titre: 'Monter en route', roles: ['voyageur'], onglet: 'voyager' },
  { chemin: '/covoit', module: 'covoiturage', composant: () => import('./Covoit.svelte'), titre: 'Covoiturage', roles: ['voyageur'], onglet: 'covoit' },
  { chemin: '/covoit/ville', module: 'covoiturage', composant: () => import('./CovoitVille.svelte'), titre: 'Covoiturage en ville', roles: ['voyageur'], onglet: 'covoit' },
  { chemin: '/covoit/conduire', module: 'covoiturage', composant: () => import('./CovoitConducteur.svelte'), titre: 'Je conduis', roles: ['voyageur', 'conducteur'], onglet: 'covoit' },
  { chemin: '/moi/conducteur', module: 'covoiturage', composant: () => import('./MoiConducteur.svelte'), titre: 'Profil conducteur', roles: ['voyageur', 'conducteur'], onglet: 'moi' }
] satisfies Route[];
