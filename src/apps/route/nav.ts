import { aller } from '../../router.svelte.ts';
/** Action Svelte pour les `<a href>` internes : le clic est intercepté et passe par le routeur (comme dans Dock.svelte). */
export function nav(node: HTMLAnchorElement) {
  const clic = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = node.getAttribute('href'); if (!href || /^(https?:|mailto:|tel:)/.test(href)) return;
    e.preventDefault(); aller(href);
  };
  node.addEventListener('click', clic);
  return { destroy: () => node.removeEventListener('click', clic) };
}
