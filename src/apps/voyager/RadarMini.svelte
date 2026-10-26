<script lang="ts">
  import type { Monde } from '../../domain/types.ts';
  import { ANNEAUX, CENTRE, destinationsRadar } from './radar.ts';

  /** Aperçu décoratif du radar (carte de l'accueil) : mêmes positions que `/radar`, réduites à 55 %. Le lien est porté par la carte. */
  let { monde, now, compteId }: { monde: Monde; now: number; compteId?: string | null } = $props();
  const ECHELLE = 0.55, HAUT = 196, CY = 98;
  const ETIQUETEES = new Set(['CDG', 'PUJ', 'BOG', 'PPT', 'NRT']);
  const points = $derived(destinationsRadar(monde, now, compteId).map((d) => ({ code: d.code, x: (d.x - CENTRE) * ECHELLE, y: (d.y - CENTRE) * ECHELLE, drop: d.offres.some((o) => o.type === 'drop'), nom: ETIQUETEES.has(d.code) })));
  const anneaux = ANNEAUX.map((a) => a.rayon * ECHELLE);
</script>
<span class="mini" aria-hidden="true" style="height:{HAUT}px">
  {#each anneaux as r, i (i)}<span class="anneau" class:ext={i === anneaux.length - 1} style="width:{2 * r}px;height:{2 * r}px;left:calc(50% - {r}px);top:{CY - r}px"></span>{/each}
  <span class="axe v" style="top:{CY - anneaux.at(-1)!}px;height:{2 * anneaux.at(-1)!}px"></span><span class="axe h" style="left:calc(50% - {anneaux.at(-1)!}px);width:{2 * anneaux.at(-1)!}px;top:{CY}px"></span>
  <span class="yul">YUL</span>
  {#each points as p (p.code)}
    <span class="pt" style="left:calc(50% + {p.x}px);top:{CY + p.y}px"><span class="dot" class:drop={p.drop} class:gros={p.nom}></span>{#if p.nom}<span class="nom">{p.code}</span>{/if}</span>
  {/each}
  <span class="legende">3 · 6 · 9 · 12 h+</span>
</span>
<style>
  .mini { display: block; position: relative; overflow: hidden; border-radius: 14px; background: #F5F8FB; }
  .anneau { position: absolute; box-sizing: border-box; border-radius: 999px; border: 1px solid var(--line); }
  .anneau.ext { border: 1px dashed var(--line-strong); }
  .axe { position: absolute; background: var(--surface2); } .axe.v { left: 50%; width: 1px; } .axe.h { height: 1px; }
  .yul { position: absolute; left: calc(50% - 15px); top: 83px; width: 30px; height: 30px; border-radius: 999px; background: #0B1B2E; color: #fff; display: flex; align-items: center; justify-content: center; font: 700 11px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; }
  .pt { position: absolute; display: flex; align-items: center; gap: 4px; transform: translate(-50%, -50%); font: 700 13px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; color: #0B1B2E; }
  .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--accent); border: 2px solid #fff; box-shadow: 0 0 0 1px var(--accent); box-sizing: content-box; }
  .dot.gros { width: 10px; height: 10px; } .dot.drop { background: var(--signal); border-color: #0B1B2E; box-shadow: none; }
  .nom { position: absolute; left: calc(100% + 4px); }
  .legende { position: absolute; right: 10px; bottom: 8px; font: 500 11px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); }
</style>
