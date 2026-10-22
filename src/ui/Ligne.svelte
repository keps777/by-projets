<script lang="ts">
  import type { Snippet } from 'svelte';
  /** Ligne de liste : pastille d'initiales, titre, sous-titre, valeur à droite. */
  let { ini = '', titre, sous = '', valeur = '', ton = '', couleur = 'var(--carte2)', href, children }: { ini?: string; titre: string; sous?: string; valeur?: string; ton?: 'bon' | 'danger' | ''; couleur?: string; href?: string; children?: Snippet } = $props();
</script>

<div class="l">
  {#if ini}<span class="ini" style:background={couleur}>{ini}</span>{/if}
  <div class="m"><b>{titre}</b>{#if sous}<small>{sous}</small>{/if}</div>
  {#if valeur}<span class="v mono {ton}">{valeur}</span>{/if}
  {#if children}{@render children()}{/if}
</div>

<style>
  .l { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--ligne); } .l:last-child { border: 0; }
  .ini { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; font: 600 11px var(--mono); flex: none; }
  .m { flex: 1; min-width: 0; display: flex; flex-direction: column; } b { font-weight: 600; font-size: 14.5px; } small { color: var(--muted); font-size: 12.5px; }
  .v { font-size: 14.5px; font-weight: 500; white-space: nowrap; } .bon { color: var(--bon); } .danger { color: var(--danger); }
</style>
