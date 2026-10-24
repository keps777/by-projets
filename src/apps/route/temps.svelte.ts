import { maintenant } from '../../data/store.svelte.ts';
/** Horloge réactive : `h.ms` se met à jour toutes les `pasMs` (l'horloge de l'app, donc figée avec `?maintenant=`). À appeler pendant l'initialisation d'un composant. */
export function horloge(pasMs = 10_000) {
  let ms = $state(maintenant());
  $effect(() => { ms = maintenant(); const t = setInterval(() => (ms = maintenant()), pasMs); return () => clearInterval(t); });
  return { get ms() { return ms; } };
}
