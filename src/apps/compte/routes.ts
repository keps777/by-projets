import type { Route } from '../../router.svelte.ts';
// Compte (verso, face nuit) : compte, Pass NexG (public : consultable sans compte), alertes, centre et préférences de notifications, aide et contact.
const routes: Route[] = [
  { chemin: '/compte', composant: () => import('./Compte.svelte'), titre: 'Compte', acces: 'compte' },
  { chemin: '/pass', composant: () => import('./Pass.svelte'), titre: 'Pass NexG', acces: 'public' },
  { chemin: '/alertes', composant: () => import('./Alertes.svelte'), titre: 'Alertes', acces: 'compte' },
  { chemin: '/notifications', composant: () => import('./Notifications.svelte'), titre: 'Notifications', acces: 'compte' },
  { chemin: '/notifications/preferences', composant: () => import('./Preferences.svelte'), titre: 'Préférences de notifications', acces: 'compte' },
  { chemin: '/aide', composant: () => import('./Aide.svelte'), titre: 'Aide', acces: 'compte' },
  { chemin: '/aide/contact', composant: () => import('./Contact.svelte'), titre: 'Contacter l’assistance', acces: 'compte' }
];
export default routes;
