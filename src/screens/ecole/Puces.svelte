<script lang="ts">
  /** Groupe de choix à puces (un seul choix), accessible : boutons radio, 44 px d'appui minimum. */
  type Option = { valeur: string | number; label: string; sous?: string; desactive?: boolean };
  let { options, valeur = $bindable(), etiquette, onchoix, colonnes = 0 }: { options: Option[]; valeur: string | number; etiquette: string; onchoix?: (v: string | number) => void; colonnes?: number } = $props();
</script>

<div class="puces" role="radiogroup" aria-label={etiquette} style:grid-template-columns={colonnes ? `repeat(${colonnes}, 1fr)` : null}>
  {#each options as o (o.valeur)}
    <button type="button" role="radio" aria-checked={valeur === o.valeur} class:on={valeur === o.valeur} disabled={o.desactive} onclick={() => { valeur = o.valeur; onchoix?.(o.valeur); }}>
      <b>{o.label}</b>{#if o.sous}<small>{o.sous}</small>{/if}
    </button>
  {/each}
</div>

<style>
  .puces { display: flex; flex-wrap: wrap; gap: 8px; } .puces[style*='grid'] { display: grid; }
  button { min-height: 44px; min-width: 44px; padding: 8px 14px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); color: var(--muted); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
  button.on { background: var(--primaire-fond); border-color: var(--primaire); color: var(--texte); } b { font-weight: 600; font-size: 14.5px; } small { font: 500 11px var(--mono); }
  button:disabled { opacity: 0.4; }
</style>
