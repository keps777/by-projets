// Clic interne : navigue par `aller()` sauf ouverture dans un nouvel onglet (comme Dock.svelte).
import { aller } from '../../router.svelte.ts';
export function va(e: MouseEvent, href: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault(); aller(href);
}
