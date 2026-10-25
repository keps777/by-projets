import type { ItemDock } from './Dock.svelte';
/** Dock du voyageur : Voyager · Covoit | Orbe (toutes les actions) | Billets · Direct · Moi. */
export const dockVoyageur = (actif: 'voyager' | 'covoit' | 'billets' | 'direct' | 'moi' | '' = ''): ItemDock[] => [
  { href: '/', label: 'Voyager', icone: 'bus', actif: actif === 'voyager' },
  { href: '/covoit', label: 'Covoit', icone: 'groupe', actif: actif === 'covoit' },
  { href: '/orbe', label: 'Toutes les actions', icone: 'orbe', orbe: true },
  { href: '/pass', label: 'Billets', icone: 'billet', actif: actif === 'billets' },
  { href: '/direct', label: 'Direct', icone: 'direct', actif: actif === 'direct' },
  { href: '/moi', label: 'Moi', icone: 'moi', actif: actif === 'moi' }
];
