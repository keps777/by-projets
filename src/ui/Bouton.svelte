<script lang="ts">
  import type { Snippet } from 'svelte';
  import { aller } from '../router.svelte.ts';
  let { variante = 'primaire', href, onclick, desactive = false, plein = true, type = 'button', children }: {
    variante?: 'primaire' | 'secondaire' | 'discret' | 'danger'; href?: string; onclick?: (e: MouseEvent) => void; desactive?: boolean; plein?: boolean; type?: 'button' | 'submit'; children: Snippet;
  } = $props();
  const clic = (e: MouseEvent) => { if (desactive) return; if (href) { e.preventDefault(); aller(href); } onclick?.(e); };
</script>

{#if href}<a class="b {variante}" class:plein class:off={desactive} {href} onclick={clic} aria-disabled={desactive}>{@render children()}</a>
{:else}<button class="b {variante}" class:plein {type} disabled={desactive} onclick={clic}>{@render children()}</button>{/if}

<style>
  .b { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 0 22px; border-radius: 16px; font-weight: 650; font-size: 15.5px; transition: transform 0.1s, opacity 0.2s; }
  .plein { width: 100%; } .b:active { transform: scale(0.98); }
  .primaire { background: var(--primaire); color: var(--sur-primaire); box-shadow: 0 8px 24px rgba(48, 80, 255, 0.35); }
  .secondaire { background: var(--carte2); border: 1px solid var(--ligne-forte); }
  .discret { color: var(--primaire-clair); min-height: 44px; } .danger { background: rgba(255, 114, 114, 0.14); color: var(--danger); border: 1px solid rgba(255, 114, 114, 0.35); }
  .b:disabled, .off { opacity: 0.4; pointer-events: none; }
</style>
