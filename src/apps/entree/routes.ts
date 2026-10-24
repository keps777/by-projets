import type { Route } from '../../router.svelte.ts';
// Entrée (splash, tutoriel, connexion, USSD, états d'erreur) et « Moi » (profil, réglages, notifications, litige, fidélité, proches).
export default [
  { chemin: '/splash', composant: () => import('./Splash.svelte'), cadre: 'plein', titre: 'Bienvenue' },
  { chemin: '/tuto', composant: () => import('./Tuto.svelte'), cadre: 'plein', titre: 'Tutoriel' },
  { chemin: '/connexion', composant: () => import('./Connexion.svelte'), cadre: 'plein', titre: 'Connexion' },
  { chemin: '/connexion/code', composant: () => import('./ConnexionCode.svelte'), cadre: 'plein', titre: 'Code SMS' },
  { chemin: '/ussd', module: 'ussd', composant: () => import('./Ussd.svelte'), cadre: 'plein', titre: 'USSD et WhatsApp' },
  { chemin: '/erreur', composant: () => import('./Erreur.svelte'), cadre: 'plein', titre: 'Erreur' },
  { chemin: '/maintenance', composant: () => import('./Maintenance.svelte'), cadre: 'plein', titre: 'Maintenance' },
  { chemin: '/reglages', composant: () => import('./Reglages.svelte'), cadre: 'plein', roles: ['voyageur'], titre: 'Réglages' },
  { chemin: '/autorisations', composant: () => import('./Autorisations.svelte'), roles: ['voyageur'], onglet: 'moi', titre: 'Autorisations' },
  { chemin: '/notifications', composant: () => import('./Notifications.svelte'), roles: ['voyageur'], onglet: 'moi', titre: 'Notifications' },
  { chemin: '/litige', composant: () => import('./Litige.svelte'), roles: ['voyageur'], onglet: 'moi', titre: 'Signaler un problème' },
  { chemin: '/moi', composant: () => import('./Moi.svelte'), roles: ['voyageur'], onglet: 'moi', titre: 'Moi' },
  { chemin: '/moi/fidelite', composant: () => import('./MoiFidelite.svelte'), roles: ['voyageur'], onglet: 'moi', titre: 'Fidélité' },
  { chemin: '/moi/proches', composant: () => import('./MoiProches.svelte'), roles: ['voyageur'], onglet: 'moi', titre: 'Mes proches' }
] satisfies Route[];
