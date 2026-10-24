import type { Route } from '../../router.svelte.ts';

/** Le siège est réservé au patron et à la comptable ; la comptable (Nadège) n'accède qu'à la comptabilité (garde dans Siege.svelte). */
const siege: Pick<Route, 'cadre' | 'roles'> = { cadre: 'web', roles: ['patron', 'comptable'] };
export default [
  { chemin: '/siege/analyses', composant: () => import('./Analyses.svelte'), titre: 'Analyses', ...siege },
  { chemin: '/siege/analyses/ligne', composant: () => import('./AnalysesLigne.svelte'), titre: 'Analyse d’une ligne', ...siege },
  { chemin: '/siege/analyses/bus', composant: () => import('./AnalysesBus.svelte'), titre: 'Analyse d’un bus', ...siege },
  { chemin: '/siege/comptable', composant: () => import('./Comptable.svelte'), titre: 'Comptabilité', ...siege },
  { chemin: '/siege/comptable/rapprochement', composant: () => import('./ComptableRapprochement.svelte'), titre: 'Rapprochement MoMo', ...siege },
  { chemin: '/siege/config', composant: () => import('./Config.svelte'), titre: 'Configuration', ...siege },
  { chemin: '/siege/config/ligne', composant: () => import('./ConfigLigne.svelte'), titre: 'Configurer une ligne', ...siege },
  { chemin: '/siege/config/personne', composant: () => import('./ConfigPersonne.svelte'), titre: 'Configurer une personne', ...siege },
  { chemin: '/siege/controle', composant: () => import('./Controle.svelte'), titre: 'Salle de contrôle', ...siege },
  { chemin: '/siege/controle/sante', composant: () => import('./ControleSante.svelte'), titre: 'Santé du système', ...siege },
  { chemin: '/parcours', composant: () => import('./Parcours.svelte'), titre: 'Tous les parcours', cadre: 'web' }
] satisfies Route[];
