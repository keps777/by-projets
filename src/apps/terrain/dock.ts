import type { ItemDock } from '../../ui/Dock.svelte';
import type { Role } from '../../domain/types.ts';
/** Dock des agents de terrain : propre à chaque rôle (le quai a un bouton central « scanner »), toujours terminé par « Moi ». */
export function dockAgent(role: Role | null | undefined, actif: string): ItemDock[] {
  const moi: ItemDock = { href: '/terrain/moi', label: 'Moi', icone: 'moi', actif: actif === 'moi' };
  switch (role) {
    case 'quai': return [{ href: '/quai', label: 'Quai', icone: 'bus', actif: actif === 'quai' }, { href: '/quai?scan=1', label: 'Scanner un billet', icone: 'scan', orbe: true }, moi];
    case 'chauffeur': return [{ href: '/chauffeur', label: 'Route', icone: 'bus', actif: actif === 'route' }, { href: '/chauffeur/arret', label: 'Arrêt', icone: 'pin', actif: actif === 'arret' }, moi];
    case 'convoyeur': return [{ href: '/convoyeur', label: 'Ventes', icone: 'billet', actif: actif === 'ventes' }, moi];
    case 'controleur': return [{ href: '/controleur', label: 'Contrôle', icone: 'scan', actif: actif === 'controle' }, moi];
    case 'conducteur': return [{ href: '/conducteur', label: 'Trajets', icone: 'taxi', actif: actif === 'trajets' }, moi];
    case 'vendeur': return [{ href: '/vendeur', label: 'Ventes', icone: 'billet', actif: actif === 'ventes' }, moi];
    default: return [moi];
  }
}
