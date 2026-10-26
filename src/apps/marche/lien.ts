import { aller } from '../../router.svelte.ts';
/** Clic sur un `<a href>` interne : navigation du routeur sans rechargement (un clic modifié garde le comportement du navigateur). */
export function naviguer(e: MouseEvent, chemin: string): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault(); aller(chemin);
}
