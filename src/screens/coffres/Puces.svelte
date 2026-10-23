<script lang="ts" generics="T extends string | number">
  /** Choix unique sous forme de puces (groupe radio accessible, appui 44 px). */
  let { options, valeur = $bindable(), nom, onchoix }: { options: { valeur: T; label: string }[]; valeur: T | null; nom: string; onchoix?: (v: T) => void } = $props();
</script>

<div class="puces" role="radiogroup" aria-label={nom}>
  {#each options as o (o.valeur)}
    <button type="button" role="radio" aria-checked={valeur === o.valeur} class:actif={valeur === o.valeur} onclick={() => { valeur = o.valeur; onchoix?.(o.valeur); }}>{o.label}</button>
  {/each}
</div>

<style>
  .puces { display: flex; flex-wrap: wrap; gap: 8px; }
  button { min-height: 44px; min-width: 56px; padding: 0 16px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne); color: var(--muted); font-weight: 550; font-size: 14.5px; }
  button.actif { background: var(--primaire-fond); border-color: var(--primaire); color: var(--texte); }
</style>
