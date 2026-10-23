// Routes du parcours d'accès : ouverture, inscription, connexion, sécurité, profil.
import type { Route } from '../../router.svelte.ts';

const plein = { cadre: 'plein' as const };
const routes: Route[] = [
  { chemin: '/splash', composant: () => import('./Splash.svelte'), titre: 'Ouverture', ...plein },
  { chemin: '/bienvenue', composant: () => import('./Bienvenue.svelte'), titre: 'Bienvenue', ...plein },
  { chemin: '/inscription/telephone', composant: () => import('./Telephone.svelte'), titre: 'Votre numéro', ...plein },
  { chemin: '/inscription/code', composant: () => import('./CodeSms.svelte'), titre: 'Code SMS', ...plein },
  { chemin: '/inscription/identite', composant: () => import('./Identite.svelte'), titre: 'Identité', ...plein },
  { chemin: '/inscription/pass', composant: () => import('./ChoixPass.svelte'), titre: 'Votre Pass', ...plein },
  { chemin: '/inscription/creer-code', composant: () => import('./CreerCode.svelte'), titre: 'Créer le code', ...plein },
  { chemin: '/inscription/confirmer-code', composant: () => import('./ConfirmerCode.svelte'), titre: 'Confirmer le code', ...plein },
  { chemin: '/inscription/pret', composant: () => import('./Pret.svelte'), titre: 'Compte ouvert', ...plein },
  { chemin: '/connexion', composant: () => import('./Connexion.svelte'), titre: 'Connexion', ...plein },
  { chemin: '/connexion/biometrie', composant: () => import('./ConnexionBiometrique.svelte'), titre: 'Face ID', ...plein },
  { chemin: '/code-oublie', composant: () => import('./CodeOublie.svelte'), titre: 'Code oublié', ...plein },
  { chemin: '/verrou', composant: () => import('./Verrou.svelte'), titre: 'Compte verrouillé', ...plein },
  { chemin: '/session', composant: () => import('./Session.svelte'), titre: 'Session expirée', ...plein },
  { chemin: '/nouvel-appareil', composant: () => import('./NouvelAppareil.svelte'), titre: 'Nouvel appareil', ...plein },
  { chemin: '/biometrie', composant: () => import('./Biometrie.svelte'), titre: 'Biométrie', ...plein },
  { chemin: '/notifications-permission', composant: () => import('./Notifications.svelte'), titre: 'Notifications', ...plein },
  { chemin: '/deconnexion', composant: () => import('./Deconnexion.svelte'), titre: 'Déconnexion', ...plein },
  { chemin: '/profil', composant: () => import('./Profil.svelte'), titre: 'Profil', garde: 'connecte', onglet: 'profil' },
  { chemin: '/profil/appareils', composant: () => import('./Appareils.svelte'), titre: 'Sécurité', garde: 'connecte', onglet: 'profil' }
];
export default routes;
