import { maintenant } from '../../data/store.svelte.ts';
/** Horloge réactive pour les comptes à rebours : à appeler à l'initialisation d'un composant. `pas` en ms. */
export function tempsReel(pas = 1000): { readonly maintenant: number } {
  let t = $state(maintenant());
  $effect(() => { t = maintenant(); const id = setInterval(() => { t = maintenant(); }, pas); return () => clearInterval(id); });
  return { get maintenant() { return t; } };
}
/** L'utilisateur demande moins de mouvement (animations remplacées par un fondu, défilement en pause). */
export const mouvementReduit = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** État de connexion réactif (évènements `online` / `offline`) : les écrans affichent un bandeau « hors ligne » quand les prix viennent du cache. */
export const reseau = $state({ enLigne: typeof navigator === 'undefined' ? true : navigator.onLine });
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (reseau.enLigne = true));
  window.addEventListener('offline', () => (reseau.enLigne = false));
}
