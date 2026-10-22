<script lang="ts">
  import type { Snippet } from 'svelte';
  import { aller } from '../router.svelte.ts';
  let { href, accent = '', onclick, children, rayon = 22 }: { href?: string; accent?: string; onclick?: () => void; children: Snippet; rayon?: number } = $props();
</script>

{#if href}<a class="c" href={href} style:--accent={accent || null} style:border-radius="{rayon}px" onclick={(e) => { e.preventDefault(); aller(href); }}>{@render children()}</a>
{:else if onclick}<button class="c" style:--accent={accent || null} style:border-radius="{rayon}px" {onclick}>{@render children()}</button>
{:else}<div class="c" style:--accent={accent || null} style:border-radius="{rayon}px">{@render children()}</div>{/if}

<style>
  .c { display: block; width: 100%; text-align: left; background: var(--carte); border: 1px solid var(--ligne); padding: 16px; position: relative; }
  .c[style*='--accent'] { border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 14%, var(--carte)), var(--carte) 60%); }
</style>
