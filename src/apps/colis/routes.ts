import type { Route } from '../../router.svelte.ts';

/** Colis, points relais, livraison moto et candidatures partenaires. */
export default [
  { chemin: '/colis/envoi', composant: () => import('./Envoi.svelte'), titre: 'Envoyer un colis', roles: ['voyageur'], onglet: 'voyager' },
  { chemin: '/colis/suivi', composant: () => import('./Suivi.svelte'), titre: 'Mon colis', roles: ['voyageur'], onglet: 'billets' },
  { chemin: '/relais', composant: () => import('./Relais.svelte'), titre: 'Points relais', roles: ['voyageur', 'relais', 'livreur'], onglet: 'voyager' },
  { chemin: '/livraison', composant: () => import('./Livraison.svelte'), titre: 'Livraison moto', roles: ['voyageur'], onglet: 'direct' },
  { chemin: '/relais/devenir', composant: () => import('./RelaisDevenir.svelte'), titre: 'Devenir point relais', roles: ['voyageur'], onglet: 'moi' },
  { chemin: '/relais/inscription', composant: () => import('./RelaisInscription.svelte'), titre: 'Fiche point relais', roles: ['voyageur', 'relais'], onglet: 'moi' },
  { chemin: '/livreur/devenir', composant: () => import('./LivreurDevenir.svelte'), titre: 'Devenir livreur moto', roles: ['voyageur', 'livreur'], onglet: 'moi' },
  { chemin: '/relais/app', composant: () => import('./RelaisApp.svelte'), titre: 'App du point relais', roles: ['relais'], cadre: 'plein' },
  { chemin: '/livreur', composant: () => import('./Livreur.svelte'), titre: 'App du livreur', roles: ['livreur'], cadre: 'plein' }
] satisfies Route[];
