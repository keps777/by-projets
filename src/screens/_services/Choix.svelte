<script lang="ts" generics="T extends string | number">
  /** Rangée de puces à choix unique (groupe radio accessible). */
  interface Option { valeur: T; label: string; desactive?: boolean; aria?: string }
  let { valeur = $bindable(), options, nom, onchoix, colonnes = 0 }: { valeur: T; options: Option[]; nom: string; onchoix?: (v: T) => void; colonnes?: number } = $props();
  const choisir = (o: Option) => { if (o.desactive) return; valeur = o.valeur; onchoix?.(o.valeur); };
</script>

<div class="rang" role="radiogroup" aria-label={nom} style:grid-template-columns={colonnes ? `repeat(${colonnes}, minmax(0, 1fr))` : null} class:grille={colonnes > 0}>
  {#each options as o (o.valeur)}
    <button type="button" role="radio" aria-checked={o.valeur === valeur} aria-label={o.aria} aria-disabled={o.desactive} class:on={o.valeur === valeur} class:off={o.desactive} onclick={() => choisir(o)}>{o.label}</button>
  {/each}
</div>

<style>
  .rang { display: flex; gap: 8px; flex-wrap: wrap; } .grille { display: grid; }
  button { min-height: 44px; padding: 0 16px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--carte); color: var(--doux); font-weight: 550; font-size: 14px; flex: 1; }
  .on { background: var(--primaire-fond); border-color: var(--primaire); color: var(--texte); }
  .off { opacity: 0.4; cursor: not-allowed; }
</style>
