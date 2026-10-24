import type { ItemDock } from '../../ui/Dock.svelte';
/** Dock de l'agent de guichet : Guichet · Quai (autre agent) · Vendre (orbe) · Caisse · Moi. */
export const dockAgent = (actif: 'guichet' | 'quai' | 'caisse' | 'moi' | '' = ''): ItemDock[] => [
  { href: '/guichet', label: 'Guichet', icone: 'billet', actif: actif === 'guichet' }, { href: '/quai', label: 'Quai', icone: 'scan', actif: actif === 'quai' },
  { href: '/vente', label: 'Vendre un billet', icone: 'plus', orbe: true }, { href: '/caisse', label: 'Caisse', icone: 'argent', actif: actif === 'caisse' }, { href: '/guichet/moi', label: 'Moi', icone: 'moi', actif: actif === 'moi' }
];
