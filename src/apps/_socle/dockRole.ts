// Barre du bas d'un écran partagé entre plusieurs rôles (le quai ouvert au guichet et au superviseur, le dépôt ouvert au relais…) :
// chaque rôle retrouve SA barre, jamais celle d'un autre métier (dont les liens lui seraient fermés).
import type { ItemDock } from '../../ui/Dock.svelte';
import { dockVoyageur } from '../../ui/dockVoyageur.ts';
import { dockAgent as dockGuichet } from '../guichet/dock.ts';
import { dockSuperviseur } from '../superviseur/dock.ts';
import { dockPatron } from '../patron/dockPatron.ts';
import { dockAgent as dockTerrain } from '../terrain/dock.ts';
import { ACCUEIL } from '../../domain/acces.ts';
import type { Role } from '../../domain/types.ts';

export interface Actifs { voyageur?: Parameters<typeof dockVoyageur>[0]; guichet?: Parameters<typeof dockGuichet>[0]; terrain?: string }
export function dockDuRole(role: Role | null | undefined, actif: Actifs = {}): ItemDock[] | undefined {
  switch (role) {
    case 'voyageur': return dockVoyageur(actif.voyageur);
    case 'guichet': return dockGuichet(actif.guichet);
    case 'superviseur': return dockSuperviseur('');
    case 'patron': return dockPatron('');
    case 'quai': case 'chauffeur': case 'convoyeur': case 'controleur': case 'conducteur': case 'vendeur': return dockTerrain(role, actif.terrain ?? '');
    default: return undefined; // relais, livreur, comptable : écrans pleins, sans barre
  }
}
/** Accueil du rôle (« retour » d'un écran partagé). */
export const accueilDe = (role: Role | null | undefined): string => (role ? ACCUEIL[role] : '/');
