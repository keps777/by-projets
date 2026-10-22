<script lang="ts">
  import type { Snippet } from 'svelte';
  let { ton = 'neutre', children }: { ton?: 'neutre' | 'bon' | 'alerte' | 'danger' | 'primaire'; children: Snippet } = $props();
</script>

<span class="p {ton}">{@render children()}</span>

<style>
  .p { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 99px; font: 500 10.5px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; background: var(--carte2); color: var(--muted); }
  .bon { background: rgba(61, 213, 152, 0.14); color: var(--bon); } .alerte { background: rgba(255, 122, 47, 0.14); color: var(--alerte); }
  .danger { background: rgba(255, 114, 114, 0.14); color: var(--danger); } .primaire { background: var(--primaire-fond); color: var(--pale); }
</style>
