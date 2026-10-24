import type { Route } from '../../router.svelte.ts';
import type { Role } from '../../domain/types.ts';
/** Le radar du quai est aussi ouvert au guichet (qui y voit les billets de son départ) et au superviseur (qui arbitre les refus). */
const QUAI: Role[] = ['quai', 'guichet', 'superviseur'];
const AGENTS = ['quai', 'chauffeur', 'convoyeur', 'controleur', 'conducteur', 'vendeur'] as const;
export default [
  { chemin: '/quai', composant: () => import('./Quai.svelte'), roles: QUAI, titre: 'Quai · radar de scan' },
  { chemin: '/quai/ok', composant: () => import('./QuaiOk.svelte'), roles: QUAI, titre: 'Billet valide' },
  { chemin: '/quai/refus', composant: () => import('./QuaiRefus.svelte'), roles: QUAI, titre: 'Billet refusé' },
  { chemin: '/convoyeur', composant: () => import('./Convoyeur.svelte'), roles: ['convoyeur'], titre: 'Convoyeur · vente en route' },
  { chemin: '/chauffeur', composant: () => import('./Chauffeur.svelte'), roles: ['chauffeur'], titre: 'Chauffeur · feuille de route' },
  { chemin: '/chauffeur/arret', composant: () => import('./ChauffeurArret.svelte'), roles: ['chauffeur'], titre: 'Chauffeur · à l’arrêt' },
  { chemin: '/controleur', composant: () => import('./Controleur.svelte'), roles: ['controleur'], titre: 'Contrôle inopiné' },
  { chemin: '/conducteur', composant: () => import('./Conducteur.svelte'), roles: ['conducteur'], titre: 'Conducteur · mes trajets' },
  { chemin: '/vendeur', composant: () => import('./Vendeur.svelte'), roles: ['vendeur'], titre: 'Vendeur ambulant' },
  { chemin: '/terrain/moi', composant: () => import('./Moi.svelte'), roles: [...AGENTS], titre: 'Moi · terrain' }
] satisfies Route[];
