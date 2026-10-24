<script lang="ts">
  import type { Snippet } from 'svelte';
  /** Boîte à défilement horizontal pour un tableau (téléphone) : focalisable au clavier pour pouvoir défiler, nommée pour les lecteurs d'écran. */
  let { label, large = false, children }: { label: string; large?: boolean; children: Snippet } = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scrollx" class:large role="region" aria-label={label} tabindex="0">{@render children()}</div>
