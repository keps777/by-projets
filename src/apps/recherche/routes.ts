import type { Route } from '../../router.svelte.ts';
// Recherche d'un vol et choix d'une offre : formulaire, résultats (neuf, revente, agences, drops), détail d'une offre, vitrine d'agence.
// Lisibles sans compte (l'exploration est publique) ; l'achat, lui, passe par `/paiement/:offreId` qui demande un compte.
const routes: Route[] = [
  { chemin: '/rechercher', composant: () => import('./Rechercher.svelte'), titre: 'Rechercher', acces: 'public' },
  { chemin: '/resultats', composant: () => import('./Resultats.svelte'), titre: 'Résultats', acces: 'public' },
  { chemin: '/offre/:offreId', composant: () => import('./Offre.svelte'), titre: 'Détail de l’offre', acces: 'public' },
  { chemin: '/agence/:agenceId', composant: () => import('./Agence.svelte'), titre: 'Vitrine agence', acces: 'public' }
];
export default routes;
