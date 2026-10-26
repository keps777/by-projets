import { aller } from '../../router.svelte.ts';
/** Clic sur un vrai lien `<a href>` : navigation interne sans rechargement (clic modifié et nouvel onglet laissés au navigateur). */
export function va(e: MouseEvent, chemin: string): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault(); aller(chemin);
}
