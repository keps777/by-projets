<script lang="ts">
  import type { Snippet } from 'svelte';
  let { variante = 'principal', grand = false, href, onclick, desactive = false, plein = false, label, children }: {
    variante?: 'principal' | 'accent' | 'secondaire' | 'discret' | 'danger'; grand?: boolean; href?: string; onclick?: (e: MouseEvent) => void;
    desactive?: boolean; plein?: boolean; label?: string; children?: Snippet;
  } = $props();
</script>

{#if href}
  <a {href} class="bouton {variante}" class:grand class:plein aria-label={label}>{@render children?.()}</a>
{:else}
  <button type="button" class="bouton {variante}" class:grand class:plein disabled={desactive} aria-label={label} {onclick}>{@render children?.()}</button>
{/if}

<style>
  .bouton { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; padding: 0 18px; border-radius: 16px; border: 1px solid transparent; font-size: 15px; font-weight: 600; text-align: center; }
  .grand { min-height: 54px; border-radius: 18px; font-size: 16px; }
  .plein { width: 100%; }
  .principal { background: var(--inverse); color: var(--inverse-texte); }
  .accent { background: var(--accent); color: var(--accent-texte); }
  .secondaire { background: var(--surface); border-color: var(--ligne); color: var(--texte); }
  .discret { background: transparent; color: var(--muted); }
  .danger { background: transparent; border-color: var(--ligne); color: var(--mauvais); }
  .bouton:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
