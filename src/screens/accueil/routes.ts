import type { Route } from '../../router.svelte.ts';

const routes: Route[] = [
  { chemin: '/', composant: () => import('./Accueil.svelte'), garde: 'connecte', onglet: 'accueil', titre: 'Accueil' },
  { chemin: '/piliers', composant: () => import('./Piliers.svelte'), garde: 'connecte', onglet: 'accueil', titre: 'Piliers' },
  { chemin: '/notifications', composant: () => import('./Notifications.svelte'), garde: 'connecte', onglet: 'accueil', titre: 'Notifications' },
  { chemin: '/pay/scan', composant: () => import('./Scan.svelte'), garde: 'connecte', cadre: 'plein', titre: 'Payer' },
  { chemin: '/pay/facture', composant: () => import('./Facture.svelte'), garde: 'connecte', titre: 'Facture' },
  { chemin: '/pay/confirme', composant: () => import('./Confirme.svelte'), garde: 'connecte', cadre: 'plein', titre: 'Paiement' },
  { chemin: '/pay/recu', composant: () => import('./Recu.svelte'), garde: 'connecte', titre: 'Reçu' },
  { chemin: '/prelevement', composant: () => import('./Prelevement.svelte'), garde: 'connecte', onglet: 'accueil', titre: 'Prélèvement sur salaire' },
  { chemin: '/prelevement/notif', composant: () => import('./PrelevementNotif.svelte'), garde: 'connecte', cadre: 'plein', titre: 'Jour de paie' }
];
export default routes;
