import { aller } from '../../router.svelte.ts';

/** Action Svelte pour les liens internes : navigation sans rechargement (le clic droit, Ctrl/Cmd+clic et les liens externes gardent leur comportement). */
export function lien(node: HTMLAnchorElement) {
  const clic = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = node.getAttribute('href');
    if (!href || !href.startsWith('/')) return;
    e.preventDefault(); aller(href);
  };
  node.addEventListener('click', clic);
  return { destroy: () => node.removeEventListener('click', clic) };
}

/** Télécharge un texte comme fichier (CSV, texte brut). */
export function telecharger(nom: string, contenu: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copier(texte: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(texte); return true; } catch { return false; }
}
