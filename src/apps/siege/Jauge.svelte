<script lang="ts">
  import { niveau } from '../../core/sante.ts';
  /** Jauge en demi-cercle (SVG). Plus la valeur est haute, plus c'est grave : vert jusqu'au seuil bas, ambre jusqu'au seuil haut, rouge au-delà. */
  let { titre, valeur, max, seuilBas, seuilHaut, texte, sous = '' }: { titre: string; valeur: number; max: number; seuilBas: number; seuilHaut: number; texte: string; sous?: string } = $props();
  const n = $derived(niveau(valeur, seuilBas, seuilHaut)), part = $derived(Math.max(0, Math.min(1, valeur / max)) * 100);
  const couleur = $derived(n === 'ok' ? '#4ADE80' : n === 'wa' ? '#FFC24B' : '#FF6B6B');
  const mot = $derived(n === 'ok' ? 'normal' : n === 'wa' ? 'à surveiller' : 'critique');
</script>

<div class="jauge" role="meter" aria-label={titre} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(valeur, max)} aria-valuetext="{texte}, {mot}">
  <svg viewBox="0 0 120 72" aria-hidden="true"><path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="10" stroke-linecap="round" pathLength="100" />
    <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke={couleur} stroke-width="10" stroke-linecap="round" pathLength="100" stroke-dasharray="{part} 100" /></svg>
  <span class="ttl t18" style="color:{couleur}">{texte}</span>
  <span class="lab" style="font-size:11px">{titre}</span>
  {#if sous}<span class="t12 mut">{sous}</span>{/if}
</div>
