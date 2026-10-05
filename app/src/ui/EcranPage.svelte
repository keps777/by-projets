<script lang="ts">
  import type { Snippet } from 'svelte';
  import BarreOnglets from './BarreOnglets.svelte';
  /** Coque commune des écrans : zone qui défile, pied facultatif (boutons collés en bas) et barre d'onglets. */
  let { onglets = true, pied, gap = 16, children }: { onglets?: boolean; pied?: Snippet; gap?: number; children?: Snippet } = $props();
</script>

<div class="ecran">
  <div class="defile" style:gap="{gap}px">{@render children?.()}</div>
  {#if pied}<div class="pied">{@render pied()}</div>{/if}
  {#if onglets}<BarreOnglets />{/if}
</div>

<style>
  .ecran { height: 100dvh; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; background: var(--fond); }
  .defile { flex: 1; min-height: 0; overflow-y: auto; padding: calc(20px + var(--haut-sûr)) 16px 24px; display: flex; flex-direction: column; }
  .pied { flex: none; padding: 10px 16px 14px; border-top: 1px solid var(--ligne-douce); background: var(--fond); display: flex; flex-direction: column; gap: 8px; }
</style>
