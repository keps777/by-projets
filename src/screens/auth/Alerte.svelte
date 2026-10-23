<script lang="ts">
  import type { Snippet } from 'svelte';
  /** Encadré d'information, d'erreur, de succès ou d'avertissement. */
  let { ton = 'info', children }: { ton?: 'info' | 'erreur' | 'succes' | 'avert'; children: Snippet } = $props();
  const trace = { info: '', erreur: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8v5M12 16.5h.01', succes: 'M5 12l4 4 10-10', avert: 'M12 4 3 20h18zM12 10v4M12 17h.01' };
</script>

<div class="a {ton}" role={ton === 'erreur' ? 'alert' : 'status'}>
  {#if ton === 'info'}<span class="pt" aria-hidden="true"></span>
  {:else}<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d={trace[ton]} /></svg>{/if}
  <span class="t">{@render children()}</span>
</div>

<style>
  .a { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); font-size: 13px; line-height: 1.4; color: var(--muted); }
  svg { flex: none; } .t { flex: 1; min-width: 0; }
  .pt { width: 8px; height: 8px; border-radius: 4px; background: var(--primaire); box-shadow: 0 0 12px var(--primaire); flex: none; }
  .erreur { background: rgba(255, 114, 114, 0.1); border-color: rgba(255, 114, 114, 0.4); color: #ffb3b3; } .erreur svg { color: var(--danger); }
  .succes { background: rgba(61, 213, 152, 0.08); border-color: rgba(61, 213, 152, 0.3); color: var(--doux); } .succes svg { color: var(--bon); }
  .avert { background: rgba(255, 122, 47, 0.1); border-color: rgba(255, 122, 47, 0.4); color: #ffc9a8; } .avert svg { color: var(--alerte); }
</style>
