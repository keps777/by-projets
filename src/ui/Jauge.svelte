<script lang="ts">
  let { pct, couleur = 'var(--primaire)', hauteur = 8, trait = null }: { pct: number; couleur?: string; hauteur?: number; trait?: number | null } = $props();
</script>

<div class="piste" style:height="{hauteur}px" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin="0" aria-valuemax="100">
  <span style:width="{Math.max(0, Math.min(100, pct))}%" style:background={couleur}></span>
  {#if trait != null}<i style:left="{trait}%"></i>{/if}
</div>

<style>
  .piste { position: relative; border-radius: 99px; background: var(--ligne); overflow: visible; }
  span { position: absolute; inset: 0 auto 0 0; border-radius: 99px; transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
  i { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--texte); opacity: 0.5; }
</style>
