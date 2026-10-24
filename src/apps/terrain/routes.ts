import type { Route } from '../../router.svelte.ts';
const AGENTS = ['quai', 'chauffeur', 'convoyeur', 'controleur', 'conducteur', 'vendeur'] as const;
export default [
  { chemin: '/quai', composant: () => import('./Quai.svelte'), roles: ['quai'], titre: 'Quai · radar de scan' },
  { chemin: '/quai/ok', composant: () => import('./QuaiOk.svelte'), roles: ['quai'], titre: 'Billet valide' },
  { chemin: '/quai/refus', composant: () => import('./QuaiRefus.svelte'), roles: ['quai'], titre: 'Billet refusé' },
  { chemin: '/convoyeur', composant: () => import('./Convoyeur.svelte'), roles: ['convoyeur'], titre: 'Convoyeur · vente en route' },
  { chemin: '/chauffeur', composant: () => import('./Chauffeur.svelte'), roles: ['chauffeur'], titre: 'Chauffeur · feuille de route' },
  { chemin: '/chauffeur/arret', composant: () => import('./ChauffeurArret.svelte'), roles: ['chauffeur'], titre: 'Chauffeur · à l’arrêt' },
  { chemin: '/controleur', composant: () => import('./Controleur.svelte'), roles: ['controleur'], titre: 'Contrôle inopiné' },
  { chemin: '/conducteur', composant: () => import('./Conducteur.svelte'), roles: ['conducteur'], titre: 'Conducteur · mes trajets' },
  { chemin: '/vendeur', composant: () => import('./Vendeur.svelte'), roles: ['vendeur'], titre: 'Vendeur ambulant' },
  { chemin: '/terrain/moi', composant: () => import('./Moi.svelte'), roles: [...AGENTS], titre: 'Moi · terrain' }
] satisfies Route[];
