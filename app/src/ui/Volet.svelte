<script lang="ts">
  import type { Snippet } from 'svelte';
  let { ouvert, onfermer, label = '', children }: { ouvert: boolean; onfermer: () => void; label?: string; children?: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => { if (ouvert && e.key === 'Escape') onfermer(); }} />

{#if ouvert}
  <div class="couche">
    <button type="button" class="voile" aria-label="Fermer" onclick={onfermer}></button>
    <div class="feuille" role="dialog" aria-modal="true" aria-label={label}>
      <span class="poignee"></span>
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  .couche { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column; justify-content: flex-end; max-width: 480px; margin: 0 auto; }
  .voile { position: absolute; inset: 0; border: 0; padding: 0; background: var(--voile); animation: fondu 0.2s ease; }
  .feuille { position: relative; max-height: 92%; overflow-y: auto; background: var(--feuille); border-radius: 28px 28px 0 0; padding: 10px 18px calc(22px + var(--bas-sûr)); display: flex; flex-direction: column; gap: 14px; animation: monter 0.25s ease; }
  .poignee { align-self: center; width: 40px; height: 5px; border-radius: 3px; background: var(--ligne); flex: none; }
  @keyframes monter { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes fondu { from { opacity: 0; } to { opacity: 1; } }
</style>
