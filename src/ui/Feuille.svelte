<script lang="ts">
  import type { Snippet } from 'svelte';
  /** Panneau modal qui monte du bas (recharger, historique, notifications…). */
  let { ouverte = $bindable(false), titre = '', sous = '', children }: { ouverte?: boolean; titre?: string; sous?: string; children: Snippet } = $props();
</script>

{#if ouverte}
  <div class="voile" role="presentation" onclick={() => (ouverte = false)} onkeydown={(e) => e.key === 'Escape' && (ouverte = false)}></div>
  <div class="feuille" role="dialog" aria-modal="true" aria-label={titre}>
    <div class="poignee"></div>
    {#if titre}<header><h2>{titre}</h2>{#if sous}<small>{sous}</small>{/if}</header>{/if}
    {@render children()}
  </div>
{/if}

<style>
  .voile { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); z-index: 40; animation: fond 0.2s; }
  .feuille { position: fixed; left: 50%; bottom: 0; width: min(100%, 460px); transform: translateX(-50%); max-height: 88dvh; overflow-y: auto; z-index: 41; background: var(--carte); border: 1px solid var(--ligne-forte); border-radius: 26px 26px 0 0; padding: 10px 18px calc(env(safe-area-inset-bottom) + 18px); animation: monte 0.28s cubic-bezier(0.2, 0.8, 0.2, 1); display: flex; flex-direction: column; gap: 12px; }
  .poignee { width: 40px; height: 4px; border-radius: 2px; background: var(--ligne-forte); align-self: center; }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; } h2 { font-size: 19px; } small { font: 500 10.5px var(--mono); letter-spacing: 0.1em; color: var(--muted); text-transform: uppercase; }
  @keyframes monte { from { transform: translate(-50%, 100%); } } @keyframes fond { from { opacity: 0; } }
</style>
