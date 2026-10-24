import { aller } from '../../router.svelte.ts';
import type { Personne } from '../../domain/types.ts';
/** Gestionnaire de clic d'un lien interne : navigation par le routeur, sans rechargement. */
export const va = (href: string) => (e: MouseEvent) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; e.preventDefault(); aller(href); };
export const initiales = (p: Pick<Personne, 'prenom' | 'nom'>) => `${p.prenom[0] ?? ''}${p.nom[0] ?? ''}`.toUpperCase();
export const hhmm = (ts: number) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
