import type { Route } from '../../router.svelte.ts';
import type { Role } from '../../domain/types.ts';
/** Écrans du guichet (agent de gare). Le patron passe partout ; le superviseur consulte en lecture seule. */
const roles: Role[] = ['guichet', 'superviseur'];
export default [
  { chemin: '/guichet', composant: () => import('./Guichet.svelte'), titre: 'Guichet', roles },
  { chemin: '/guichet/moi', composant: () => import('./MoiAgent.svelte'), titre: 'Moi · guichet', roles },
  { chemin: '/guichet/colis', composant: () => import('./GuichetColis.svelte'), titre: 'Colis au guichet', roles },
  { chemin: '/guichet/rembourser', composant: () => import('./Rembourser.svelte'), titre: 'Rembourser un billet', roles },
  { chemin: '/vente', composant: () => import('./Vente.svelte'), titre: 'Vendre', roles },
  { chemin: '/vente/ticket', composant: () => import('./VenteTicket.svelte'), titre: 'Ticket imprimé', roles },
  { chemin: '/cadence', composant: () => import('./Cadence.svelte'), titre: 'Mode cadence', roles },
  { chemin: '/cadence/billet', composant: () => import('./CadenceBillet.svelte'), titre: 'Billet cadence', roles },
  { chemin: '/cadence/quai', composant: () => import('./CadenceQuai.svelte'), titre: 'Comptage au quai', roles: [...roles, 'quai'] },
  { chemin: '/depot', composant: () => import('./Depot.svelte'), titre: 'Dépôt prépayé', roles },
  { chemin: '/caisse', composant: () => import('./Caisse.svelte'), titre: 'Caisse', roles }
] satisfies Route[];
