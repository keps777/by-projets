<script lang="ts">
  import Picto from './Picto.svelte';
  /** Bandeau « Même vol uniquement · AE 812 · 14 déc. 18:05 » (règle : un bagage ne voyage que sur son vol). */
  let { vol }: { vol: string } = $props();
</script>
<p class="meme" role="note"><Picto nom="cadenas" taille={16} /><span>Même vol uniquement</span><span class="sep" aria-hidden="true">·</span><span class="mono vol">{vol}</span></p>
<style>
  .meme { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; row-gap: 2px; min-height: 40px; padding: 8px 12px; border-radius: 12px; background: #060708; border: 1px solid rgba(255, 210, 63, .45); color: var(--signal); font: 700 13px/18px 'Barlow', sans-serif; }
  .sep { color: var(--ink3); } .vol { font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
