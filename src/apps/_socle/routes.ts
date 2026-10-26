import type { Route } from '../../router.svelte.ts';
// Routes du socle : l'accueil provisoire (remplacé par l'accueil double face à la phase « recto »), l'annuaire des écrans et la page introuvable.
const routes: Route[] = [
  { chemin: '/', composant: () => import('./AccueilProvisoire.svelte'), titre: 'Accueil' },
  { chemin: '/explorer', composant: () => import('./AccueilProvisoire.svelte'), titre: 'Explorer', acces: 'public' },
  { chemin: '/prive', composant: () => import('./Prive.svelte'), titre: 'Zone privée' },
  { chemin: '/ecrans', composant: () => import('./Annuaire.svelte'), titre: 'Tous les écrans', acces: 'public' }
];
/** Écrans réservés des phases suivantes (verso · Mes actifs, drops, compte…) : une page « bientôt » tient la place jusqu'à leur construction. Chaque agent qui construit l'un d'eux retire sa ligne d'ici. */
const BIENTOT: [string, string, 'accueil' | 'rechercher' | 'drops' | 'portefeuille' | 'compte'][] = [
  ['/portefeuille', 'Portefeuille', 'portefeuille'], ['/droit/:id', 'Mon droit de voyage', 'portefeuille'], ['/cours/:id', 'Cours du vol', 'portefeuille'], ['/revendre/:id', 'Revendre', 'portefeuille'], ['/transferer/:id', 'Transférer à un proche', 'portefeuille'],
  ['/echeances', 'Échéances', 'portefeuille'], ['/solde', 'Solde NexG', 'portefeuille'], ['/drops', 'Drops membres', 'drops'], ['/pass', 'Pass NexG', 'compte'], ['/compte', 'Compte', 'compte'], ['/notifications', 'Notifications', 'compte'], ['/alertes', 'Alertes', 'compte'], ['/aide', 'Aide', 'compte']
];
for (const [chemin, titre] of BIENTOT) routes.push({ chemin, composant: () => import('./Bientot.svelte'), titre });
export default routes;
