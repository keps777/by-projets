<script lang="ts" generics="T extends string | number">
  type Option = { valeur: T; label: string };
  let { options, valeur, onchoisir, couleur = 'var(--inverse)', texte = 'var(--inverse-texte)', colonnes, defile = false, petit = false }: {
    options: Option[]; valeur: T | null; onchoisir: (v: T) => void; couleur?: string; texte?: string; colonnes?: number; defile?: boolean; petit?: boolean;
  } = $props();
</script>

<div class="puces" class:defile style:grid-template-columns={colonnes ? `repeat(${colonnes}, minmax(0, 1fr))` : undefined} class:grille={!!colonnes}>
  {#each options as o (o.valeur)}
    <button type="button" aria-pressed={o.valeur === valeur} class:petit class:actif={o.valeur === valeur} style:--c={couleur} style:--t={texte} onclick={() => onchoisir(o.valeur)}>{o.label}</button>
  {/each}
</div>

<style>
  .puces { display: flex; gap: 6px; flex-wrap: wrap; }
  .puces.grille { display: grid; }
  .puces.defile { flex-wrap: nowrap; overflow-x: auto; margin: 0 -16px; padding: 0 16px; }
  button { flex: none; min-height: 44px; padding: 0 14px; border-radius: 14px; border: 1px solid var(--ligne); background: transparent; color: var(--texte); font-size: 13px; font-weight: 600; }
  button.petit { min-height: 40px; }
  button.actif { background: var(--c); border-color: var(--c); color: var(--t); }
</style>
