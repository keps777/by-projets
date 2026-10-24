// Action Svelte : un lien interne `<a href="/chemin" use:nav>` passe par le routeur (pas de rechargement), sauf clic modifié (nouvel onglet).
import { aller } from '../../router.svelte.ts';
export function nav(node: HTMLAnchorElement) {
  const clic = (e: MouseEvent) => {
    const href = node.getAttribute('href'); if (!href || !href.startsWith('/') || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); aller(href);
  };
  node.addEventListener('click', clic); return { destroy: () => node.removeEventListener('click', clic) };
}
