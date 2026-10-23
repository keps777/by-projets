<script lang="ts">
  import type { Snippet } from 'svelte';
  /** Petite légende de section en capitales (même style sur les quatre services). */
  let { children, id }: { children: Snippet; id?: string } = $props();
</script>

<h2 class="et" {id}>{@render children()}</h2>

<style>
  .et { font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
</style>
