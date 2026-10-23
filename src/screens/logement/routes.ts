import type { Route } from '../../router.svelte.ts';

const routes: Route[] = [
  { chemin: '/logement', composant: () => import('./Logement.svelte'), garde: 'connecte', onglet: 'accueil', titre: 'Logement' },
  { chemin: '/logement/avance', composant: () => import('./Avance.svelte'), garde: 'connecte', titre: 'Avance de loyer' },
  { chemin: '/logement/justificatifs', composant: () => import('./Justificatifs.svelte'), garde: 'connecte', titre: 'Bail et bailleur' },
  { chemin: '/logement/bailleur', composant: () => import('./Bailleur.svelte'), garde: 'connecte', titre: 'Bailleur payé' }
];
export default routes;
