<script lang="ts">
  /** Barre de progression. `trait` = position (en %) de « où je devrais être aujourd'hui ». */
  let { pct, couleur = 'var(--accent)', trait = null, hauteur = 8 }: { pct: number | null; couleur?: string; trait?: number | null; hauteur?: number } = $props();
</script>

<span class="piste" style:height="{hauteur}px" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin="0" aria-valuemax="100">
  <span class="rempli" style:width="{Math.max(0, Math.min(100, pct ?? 0))}%" style:background={couleur} style:border-radius="{hauteur / 2}px"></span>
  {#if trait != null}<span class="trait" style:left="{trait}%"></span>{/if}
</span>

<style>
  .piste { position: relative; display: block; width: 100%; border-radius: 99px; background: var(--piste); }
  .rempli { position: absolute; left: 0; top: 0; bottom: 0; transition: width 0.3s ease; }
  .trait { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--texte); opacity: 0.5; margin-left: -1px; }
</style>
