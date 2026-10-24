import type { ItemDock } from './Dock.svelte';
/** Dock du voyageur : Voyager · Billets · Orbe (toutes les actions) · Direct · Moi. */
export const dockVoyageur = (actif: 'voyager' | 'billets' | 'direct' | 'moi' | '' = ''): ItemDock[] => [
  { href: '/', label: 'Voyager', icone: 'bus', actif: actif === 'voyager' }, { href: '/pass', label: 'Billets', icone: 'billet', actif: actif === 'billets' },
  { href: '/orbe', label: 'Toutes les actions', icone: 'orbe', orbe: true }, { href: '/direct', label: 'Direct', icone: 'direct', actif: actif === 'direct' }, { href: '/moi', label: 'Moi', icone: 'moi', actif: actif === 'moi' }
];
