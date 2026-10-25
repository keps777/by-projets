import type { ItemDock } from './Dock.svelte';
/** Dock du voyageur : Voyager · Covoit | orbe (toutes les actions) | Billets · Moi. Le suivi du bus en direct s'ouvre en grande fenêtre depuis « Billets ». */
export const dockVoyageur = (actif: 'voyager' | 'covoit' | 'billets' | 'moi' | '' = ''): ItemDock[] => [
  { href: '/', label: 'Voyager', icone: 'bus', actif: actif === 'voyager' },
  { href: '/covoit', label: 'Covoit', icone: 'groupe', actif: actif === 'covoit' },
  { href: '/orbe', label: 'Toutes les actions', icone: 'orbe', orbe: true },
  { href: '/pass', label: 'Billets', icone: 'billet', actif: actif === 'billets' },
  { href: '/moi', label: 'Moi', icone: 'moi', actif: actif === 'moi' }
];
