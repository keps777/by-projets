<script lang="ts">
  import type { Snippet } from 'svelte';
  let { pct, taille = 84, epaisseur = 8, couleur = 'var(--accent)', children }: { pct: number; taille?: number; epaisseur?: number; couleur?: string; children?: Snippet } = $props();
  const r = $derived((taille - epaisseur) / 2);
  const c = $derived(2 * Math.PI * r);
</script>

<span class="anneau" style:width="{taille}px" style:height="{taille}px">
  <svg width={taille} height={taille} viewBox="0 0 {taille} {taille}" aria-hidden="true">
    <circle cx={taille / 2} cy={taille / 2} {r} fill="none" stroke="var(--piste)" stroke-width={epaisseur} />
    <circle cx={taille / 2} cy={taille / 2} {r} fill="none" stroke={couleur} stroke-width={epaisseur} stroke-linecap="round" stroke-dasharray={c}
      stroke-dashoffset={c * (1 - Math.max(0, Math.min(1, pct / 100)))} transform="rotate(-90 {taille / 2} {taille / 2})" style="transition: stroke-dashoffset 0.9s linear" />
  </svg>
  <span class="centre">{@render children?.()}</span>
</span>

<style>
  .anneau { position: relative; display: inline-flex; align-items: center; justify-content: center; flex: none; }
  svg { position: absolute; inset: 0; }
  .centre { position: relative; display: flex; flex-direction: column; align-items: center; }
</style>
