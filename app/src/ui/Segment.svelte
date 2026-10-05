<script lang="ts" generics="T extends string">
  type Option = { valeur: T; label: string; href?: string };
  let { options, valeur, onchoisir }: { options: Option[]; valeur: T; onchoisir?: (v: T) => void } = $props();
</script>

<div class="segment" style:grid-template-columns="repeat({options.length}, minmax(0, 1fr))" role="tablist">
  {#each options as o (o.valeur)}
    {#if o.href && o.valeur !== valeur}
      <a href={o.href} role="tab" aria-selected="false">{o.label}</a>
    {:else}
      <button type="button" role="tab" aria-selected={o.valeur === valeur} class:actif={o.valeur === valeur} onclick={() => onchoisir?.(o.valeur)}>{o.label}</button>
    {/if}
  {/each}
</div>

<style>
  .segment { display: grid; gap: 2px; padding: 3px; background: var(--surface-2); border-radius: 12px; }
  button, a { min-height: 44px; border: 0; border-radius: 9px; background: transparent; color: var(--muted); font-size: 13px; font-weight: 500; display: flex; align-items: center; justify-content: center; }
  button.actif { background: var(--surface); color: var(--texte); font-weight: 600; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
</style>
