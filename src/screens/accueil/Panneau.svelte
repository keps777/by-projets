<script lang="ts">
  import type { Snippet } from 'svelte';
  import Feuille from '../../ui/Feuille.svelte';
  /** Feuille du kit + fermeture avec la touche Échap. */
  let { ouverte = $bindable(false), titre = '', sous = '', children }: { ouverte?: boolean; titre?: string; sous?: string; children: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && ouverte) ouverte = false; }} />
<Feuille bind:ouverte {titre} {sous}>{@render children()}</Feuille>
