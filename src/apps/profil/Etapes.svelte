<script lang="ts">
  /** Barre d'étapes de l'inscription (« Étape 2 sur 4 »), lisible par les lecteurs d'écran. */
  let { etape }: { etape: 1 | 2 | 3 | 4 } = $props();
</script>
<div class="etapes" role="progressbar" aria-label="Progression de l'inscription" aria-valuemin="1" aria-valuemax="4" aria-valuenow={etape} aria-valuetext="Étape {etape} sur 4">
  <span class="lib">Étape {etape} sur 4</span>
  <span class="barres" aria-hidden="true">{#each [1, 2, 3, 4] as n (n)}<span class:on={n <= etape}></span>{/each}</span>
</div>
<style>
  .etapes { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .lib { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .barres { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; width: 128px; }
  .barres span { height: 4px; border-radius: 999px; background: var(--line-strong); }
  .barres span.on { background: var(--ink); }
</style>
