import { maintenant } from '../../data/store.svelte.ts';
/** Horloge réactive : à appeler à l'initialisation d'un composant ; s'arrête avec lui. */
export function horloge(ms = 1000) {
  const h = $state({ t: maintenant() });
  $effect(() => { const i = setInterval(() => { h.t = maintenant(); }, ms); return () => clearInterval(i); });
  return h;
}
