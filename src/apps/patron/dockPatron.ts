import type { ItemDock } from '../../ui/Dock.svelte';
/** Barre du bas du patron : Tableau · Gares · Assistant (orbe) · Finance · Modules. */
export const dockPatron = (actif: 'tableau' | 'gares' | 'finance' | 'modules' | '' = ''): ItemDock[] => [
  { href: '/patron', label: 'Tableau', icone: 'graphique', actif: actif === 'tableau' }, { href: '/patron/equipe', label: 'Gares', icone: 'groupe', actif: actif === 'gares' },
  { href: '/assistant', label: 'Assistant', icone: 'orbe', orbe: true }, { href: '/financement', label: 'Finance', icone: 'argent', actif: actif === 'finance' },
  { href: '/modules', label: 'Modules', icone: 'parametres', actif: actif === 'modules' }
];
