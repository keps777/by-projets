import type { ItemDock } from '../../ui/Dock.svelte';
/** Dock du superviseur : Gare · Équipe · Rapport · Moi. */
export const dockSuperviseur = (actif: 'gare' | 'equipe' | 'rapport' | 'moi' | '' = ''): ItemDock[] => [
  { href: '/superviseur', label: 'Gare', icone: 'bus', actif: actif === 'gare' },
  { href: '/superviseur/equipe', label: 'Équipe', icone: 'groupe', actif: actif === 'equipe' },
  { href: '/rapport-soir', label: 'Rapport', icone: 'graphique', actif: actif === 'rapport' },
  { href: '/superviseur/moi', label: 'Moi', icone: 'moi', actif: actif === 'moi' }
];
