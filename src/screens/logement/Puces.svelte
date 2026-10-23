<script lang="ts" generics="T extends string | number">
  /** Choix unique parmi quelques valeurs (loyer, mois d'avance, durée, type de compte). Appui minimum 44 px. */
  let { options, valeur, etiquette, onchoisir }: {
    options: { valeur: T; libelle: string; desactive?: boolean }[]; valeur: T | null; etiquette: string; onchoisir: (v: T) => void;
  } = $props();
</script>

<div class="puces" role="radiogroup" aria-label={etiquette}>
  {#each options as o (o.valeur)}
    <button type="button" role="radio" aria-checked={o.valeur === valeur} aria-disabled={o.desactive || undefined} class:on={o.valeur === valeur} class:off={o.desactive}
      onclick={() => { if (!o.desactive) onchoisir(o.valeur); }}>{o.libelle}</button>
  {/each}
</div>

<style>
  .puces { display: flex; flex-wrap: wrap; gap: 8px; }
  button { min-height: 44px; min-width: 56px; padding: 0 16px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne-forte); font: 500 14px var(--mono); color: var(--doux); }
  button.on { background: var(--primaire-fond); border-color: var(--primaire); color: var(--texte); }
  button.off { opacity: 0.4; text-decoration: line-through; cursor: not-allowed; }
</style>
