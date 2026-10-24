<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icone from '../../ui/Icone.svelte';
  /** Carte en relief en vrai CSS 3D : un sol quadrillé incliné, sur lequel on pose des éléments à plat (route, collines) ou debout (`.rl-pied`, toujours face à l'écran).
   *  Repère de 360 × 240. Se tourne au doigt (glisser) ou avec les deux boutons. */
  let { hauteur = 280, incl = 56, echelle = 1.12, label, children, az = $bindable(0) }: { hauteur?: number; incl?: number; echelle?: number; label: string; children: Snippet; az?: number } = $props();
  const MAX = 40;
  const borne = (v: number) => Math.max(-MAX, Math.min(MAX, v));
  let prise: { x: number; az0: number } | null = null;
  function debut(e: PointerEvent) { if ((e.target as HTMLElement).closest('button, a')) return; prise = { x: e.clientX, az0: az }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  function bouge(e: PointerEvent) { if (prise) az = borne(prise.az0 + (e.clientX - prise.x) * 0.35); }
  function fin() { prise = null; }
</script>

<div class="scene" style:height="{hauteur}px" role="group" aria-label={label} onpointerdown={debut} onpointermove={bouge} onpointerup={fin} onpointercancel={fin}>
  <div class="monde" style="--az: {az}deg; --incl: {incl}deg; --e: {echelle}">
    <div class="sol"></div>
    {@render children()}
  </div>
  <div class="pivots">
    <button type="button" class="pv" aria-label="Tourner la carte vers la gauche" onclick={() => (az = borne(az - 15))}><span style="transform: scaleX(-1); display: grid"><Icone nom="suivant" taille={18} trait={2.4} /></span></button>
    <button type="button" class="pv" aria-label="Tourner la carte vers la droite" onclick={() => (az = borne(az + 15))}><Icone nom="suivant" taille={18} trait={2.4} /></button>
  </div>
</div>

<style>
  .scene { position: relative; flex: none; margin: 0 -16px; perspective: 900px; perspective-origin: 50% 20%; overflow: hidden; contain: paint; touch-action: pan-y; cursor: grab; -webkit-user-select: none; user-select: none;
    background: radial-gradient(60% 55% at 50% 60%, rgba(124, 108, 255, 0.16), transparent 70%); }
  .monde { position: absolute; left: 50%; top: 54%; width: 360px; height: 240px; margin: -120px 0 0 -180px; transform-style: preserve-3d;
    transform: scale(var(--e)) rotateX(var(--incl)) rotateZ(var(--az)); transition: transform 0.25s ease-out; pointer-events: none; }
  :global(button.rl-pied), :global(a.rl-pied) { pointer-events: auto; }
  .sol { position: absolute; left: -330px; right: -330px; top: -330px; bottom: -330px; background-color: rgba(10, 14, 28, 0.7);
    background-image: linear-gradient(rgba(61, 224, 255, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(61, 224, 255, 0.16) 1px, transparent 1px); background-size: 36px 36px;
    -webkit-mask-image: radial-gradient(closest-side, #000 52%, transparent 100%); mask-image: radial-gradient(closest-side, #000 52%, transparent 100%); }
  .pivots { position: absolute; right: 12px; bottom: 8px; display: flex; gap: 6px; }
  .pv { width: 44px; height: 44px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(5, 7, 13, 0.6); color: #f2f4ff; display: grid; place-items: center; cursor: pointer; backdrop-filter: blur(10px); }
  :global(.rl-plat) { position: absolute; left: 0; top: 0; width: 360px; height: 240px; pointer-events: none; }
  :global(.rl-colline) { position: absolute; border-radius: 50%; filter: blur(8px); background: radial-gradient(circle, rgba(139, 124, 255, 0.45), transparent 70%); pointer-events: none; }
  /* Élément debout : annule l'inclinaison et la rotation de la carte, pose sa base sur le point (left, top). */
  :global(.rl-pied) { position: absolute; transform-origin: 0 0; transform: rotateZ(calc(var(--az) * -1)) rotateX(calc(var(--incl) * -1)) scale(calc(1 / var(--e))) translate(-50%, -100%); transition: left 0.5s, top 0.5s; }
  :global(.rl-centre) { position: absolute; transform-origin: 0 0; transform: rotateZ(calc(var(--az) * -1)) rotateX(calc(var(--incl) * -1)) scale(calc(1 / var(--e))) translate(-50%, -50%); transition: left 0.5s, top 0.5s; }
</style>
