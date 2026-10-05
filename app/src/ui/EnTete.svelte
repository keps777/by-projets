<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icone from './Icone.svelte';
  import { routeur } from '../routeur.svelte.ts';
  /** En-tête d'écran secondaire : bouton retour, titre, action à droite. */
  let { titre, repli = '/', droite }: { titre?: string; repli?: string; droite?: Snippet } = $props();
</script>

<header>
  <button type="button" class="rond" aria-label="Retour" onclick={() => routeur.retour(repli)}><Icone nom="retour" taille={18} trait={2.2} /></button>
  {#if titre}<h1 class="titre">{titre}</h1>{/if}
  <span class="droite">{@render droite?.()}</span>
</header>

<style>
  header { display: flex; align-items: center; gap: 10px; }
  h1 { font-size: 20px; flex: 1; min-width: 0; }
  .droite { margin-left: auto; display: flex; align-items: center; gap: 6px; }
</style>
