<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import { TRANCHES_3H, trancheDe } from './trajet.ts';

  /** Heure de départ souhaitée, dans la fenêtre du trajet : tranches de 3 h pour aller vite, tambour 3D (glisser, flèches) et minutes pour affiner. `null` = toute la journée. */
  let { heure = $bindable(null) }: { heure?: string | null } = $props();
  const STEP = 15, RAYON = 105;
  let rot = $state(heure ? -Number(heure.slice(0, 2)) * STEP : -8 * STEP), minute = $state(heure ? Number(heure.slice(3, 5)) : 0), drag = $state<{ y: number; r: number } | null>(null);
  const h = $derived(((Math.round(-rot / STEP) % 24) + 24) % 24), hh = $derived(String(h).padStart(2, '0')), mm = $derived(String(minute).padStart(2, '0'));
  const lignes = $derived(Array.from({ length: 24 }, (_, i) => {
    const rel = (((i * STEP + rot) % 360) + 360) % 360, dist = Math.min(rel, 360 - rel);
    return { i, t: `${String(i).padStart(2, '0')} h`, op: dist > 80 ? '0' : Math.max(0.15, 1 - dist / 80).toFixed(2) };
  }));
  const emettre = () => { heure = `${hh}:${mm}`; };
  function caler(r: number) { rot = Math.round(r / STEP) * STEP; drag = null; emettre(); }
  function aHeure(hv: number, mn = minute) { const base = -hv * STEP; rot = base + 360 * Math.round((rot - base) / 360); minute = mn; emettre(); }
  const bas = (e: PointerEvent) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); drag = { y: e.clientY, r: rot }; };
  const bouge = (e: PointerEvent) => { if (drag) rot = drag.r + (e.clientY - drag.y) * 0.6; };
  const haut = () => { if (drag) caler(rot); };
  function touche(e: KeyboardEvent) {
    const pas = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : e.key === 'PageUp' ? 3 : e.key === 'PageDown' ? -3 : 0;
    if (pas) { e.preventDefault(); e.stopPropagation(); caler(rot - pas * STEP); }
  }
  const tranche = $derived(trancheDe(heure));
</script>

<div class="heure">
  <span class="lab" id="lib-heure">Heure de départ souhaitée</span>
  <div class="chips tr" role="group" aria-labelledby="lib-heure">
    <button type="button" class="ch" class:on={heure === null} aria-pressed={heure === null} onclick={() => (heure = null)}>Toute la journée</button>
    {#each TRANCHES_3H as t, i (t.debut)}
      <button type="button" class="ch" class:on={tranche === i} aria-pressed={tranche === i} onclick={() => aHeure(i * 3, 0)}>{t.libelle}</button>
    {/each}
  </div>
  <div class="drumw" class:neutre={heure === null}>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="drum" role="spinbutton" tabindex="0" aria-label="Heure précise" aria-valuemin="0" aria-valuemax="23" aria-valuenow={h} aria-valuetext={heure === null ? 'toute la journée' : `${hh} heures`} onkeydown={touche}
      onpointerdown={bas} onpointermove={bouge} onpointerup={haut} onpointercancel={haut}>
      <div class="dr" class:nt={drag} style="transform: rotateX({rot}deg)" aria-hidden="true">
        {#each lignes as l (l.i)}<div class="hr" style="transform: rotateX({l.i * STEP}deg) translateZ({RAYON}px); opacity: {l.op}">{l.t}</div>{/each}
      </div>
    </div>
    <div class="ud"><button type="button" onclick={() => caler(rot - STEP)} aria-label="Heure suivante"><span class="hautf"><Icone nom="retour" /></span></button><button type="button" onclick={() => caler(rot + STEP)} aria-label="Heure précédente"><span class="basf"><Icone nom="retour" /></span></button></div>
    <div class="mins" role="group" aria-label="Minutes">
      {#each [0, 15, 30, 45] as v (v)}<button type="button" class:on={heure !== null && minute === v} aria-pressed={heure !== null && minute === v} onclick={() => aHeure(h, v)}>:{String(v).padStart(2, '0')}</button>{/each}
    </div>
  </div>
</div>

<style>
  .heure { display: flex; flex-direction: column; gap: 8px; }
  .tr { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; overflow: visible; } .tr .ch { min-height: 44px; padding: 0 4px; font-size: 13px; justify-content: center; white-space: nowrap; } .tr .ch:first-child { grid-column: 1 / -1; }
  .drumw { display: flex; align-items: center; gap: 10px; }
  .drumw.neutre .drum { opacity: 0.55; }
  .drum { position: relative; flex: 1; min-width: 0; height: 168px; perspective: 700px; overflow: hidden; border-radius: 22px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); touch-action: none; cursor: grab; user-select: none; }
  .drum:focus-visible { outline: 2px solid #7febff; }
  .drum:before { content: ''; position: absolute; left: 12px; right: 12px; top: 50%; height: 50px; margin-top: -25px; border-radius: 14px; background: linear-gradient(135deg, rgba(139, 124, 255, 0.3), rgba(61, 224, 255, 0.2)); border: 1px solid rgba(139, 124, 255, 0.5); pointer-events: none; z-index: 0; }
  .dr { position: absolute; left: 0; right: 0; top: 50%; height: 0; transform-style: preserve-3d; transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
  .dr.nt { transition: none; }
  .hr { position: absolute; left: 0; right: 0; top: -22px; height: 44px; display: grid; place-items: center; font: 700 26px 'Unbounded Variable', 'Unbounded', sans-serif; letter-spacing: -0.03em; backface-visibility: hidden; }
  .mins { display: flex; flex-direction: column; gap: 4px; }
  .mins button { min-width: 56px; min-height: 44px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); color: #b7c0db; font: 700 14px 'Geist Mono', monospace; cursor: pointer; }
  .mins .on { background: #3de0ff; color: #06080f; border-color: transparent; }
  .ud { display: flex; flex-direction: column; gap: 6px; }
  .ud button { width: 44px; height: 44px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; display: grid; place-items: center; }
  .hautf { display: grid; transform: rotate(90deg); } .basf { display: grid; transform: rotate(-90deg); }
  @media (max-width: 359px) { .ud { display: none; } }
</style>
