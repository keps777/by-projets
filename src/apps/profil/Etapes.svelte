<script lang="ts">
  /** Barre d'étapes de l'inscription (« Étape 2 sur 4 »), lisible par les lecteurs d'écran. Sur PC : libellé à gauche, « Ensuite : … » à droite, barres de 6 px sur toute la largeur. */
  let { etape, ensuite }: { etape: 1 | 2 | 3 | 4; ensuite?: string } = $props();
</script>
<div class="etapes" role="progressbar" aria-label="Progression de l'inscription" aria-valuemin="1" aria-valuemax="4" aria-valuenow={etape} aria-valuetext="Étape {etape} sur 4">
  <span class="haut"><span class="lib">Étape {etape} sur 4</span>{#if ensuite}<span class="suite">{ensuite}</span>{/if}</span>
  <span class="barres" aria-hidden="true">{#each [1, 2, 3, 4] as n (n)}<span class:on={n <= etape}></span>{/each}</span>
</div>
<style>
  .etapes { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .haut { display: contents; } .suite { display: none; }
  .lib { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .barres { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; width: 128px; }
  .barres span { height: 4px; border-radius: 999px; background: var(--line-strong); }
  .barres span.on { background: var(--ink); }
  @media (min-width: 900px) {
    .etapes { align-items: stretch; gap: 8px; }
    .haut { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 8px; font-size: 13px; }
    .lib { font: 700 13px/18px 'Barlow', sans-serif; letter-spacing: 0; text-transform: none; color: var(--ink); }
    .suite { display: inline; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
    .barres { width: auto; gap: 6px; } .barres span { height: 6px; transition: background-color 300ms ease; }
    .barres span:not(.on) { background: var(--line); }
  }
</style>
