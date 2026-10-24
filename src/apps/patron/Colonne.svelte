<script lang="ts">
  import type { Snippet } from 'svelte';
  /** Colonne du corps d'un écran : empêche les boutons de s'écraser quand le contenu dépasse (le corps `.bd` est un flex à hauteur fixe). */
  let { children }: { children: Snippet } = $props();
</script>

<div class="colonne">{@render children()}</div>

<style>
  .colonne { display: flex; flex-direction: column; gap: 12px; flex: 1 0 auto; min-width: 0; }
  .colonne > :global(*) { flex-shrink: 0; }
</style>
