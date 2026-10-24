<script lang="ts">
  import { aller } from '../router.svelte.ts';
  import Icone from './Icone.svelte';
  export interface ItemDock { href: string; label: string; icone: string; /** Bouton central en relief (orbe). */ orbe?: boolean; actif?: boolean }
  /** Barre de navigation flottante du bas (verre dépoli). */
  let { items, label = 'Navigation principale' }: { items: ItemDock[]; label?: string } = $props();
</script>

<nav class="dock" aria-label={label}>
  {#each items as it (it.href + it.label)}
    <a href={it.href} class:on={it.actif} class:orb={it.orbe} aria-label={it.orbe ? it.label : undefined} aria-current={it.actif ? 'page' : undefined} onclick={(e) => { e.preventDefault(); aller(it.href); }}>
      <Icone nom={it.icone} taille={it.orbe ? 26 : 22} trait={it.orbe ? 2.2 : 1.9} />{#if !it.orbe}<span>{it.label}</span>{/if}
    </a>
  {/each}
</nav>
