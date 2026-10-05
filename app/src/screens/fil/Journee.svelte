<script lang="ts">
  import { untrack } from 'svelte';
  import type { BlocVue } from '../../data/requetes.ts';
  import { maintenantLocal } from '../../data/temps.svelte.ts';
  import BlocFil from './BlocFil.svelte';
  import { disposer } from './disposition.ts';
  import { PX, pctDuBloc } from './vue-blocs.ts';
  import { hm } from './format.ts';

  /** Journée de 24 h : heures, blocs placés à leur heure (côte à côte s'ils se chevauchent), ligne « maintenant » en direct. */
  let { blocs, jour, aujourdhui, estAujourdhui, focusMin, onouvrir, onjouer }: {
    blocs: BlocVue[]; jour: string; aujourdhui: string; estAujourdhui: boolean; focusMin: number;
    onouvrir: (id: string) => void; onjouer: (id: string) => void;
  } = $props();

  const maintenant = $derived(maintenantLocal().minutes);
  const places = $derived(disposer(blocs.map((b) => ({ debut: b.debutMin, fin: b.finMin }))));
  const mois = $derived(aujourdhui.slice(0, 7));
  const pcts = $derived(blocs.map((b) => pctDuBloc(b, mois, aujourdhui)));
  const heures = Array.from({ length: 25 }, (_, h) => h);

  let defile: HTMLDivElement | undefined = $state();
  // Ouvre la journée sur « maintenant » (ou sur le bloc en cours), à chaque changement de jour.
  $effect(() => {
    void jour;
    const el = defile;
    const cible = untrack(() => focusMin);
    if (el) el.scrollTop = Math.max(0, cible * PX - 140);
  });
</script>

<div class="defile-jour" bind:this={defile}>
  <div class="grille" style:height="{24 * 60 * PX}px">
    {#each heures as h (h)}
      <div class="heure" style:top="{h * 60 * PX - 7}px" style:opacity={estAujourdhui && Math.abs(h * 60 - maintenant) < 13 ? 0 : 1}>
        <span class="mono">{hm(h * 60)}</span><span class="trait"></span>
      </div>
    {/each}

    {#each blocs as b, i (b.occ.id)}
      <BlocFil {b} pct={pcts[i]} col={places[i]?.col ?? 0} cols={places[i]?.cols ?? 1} aujourdhui={estAujourdhui}
        passe={estAujourdhui ? b.finMin <= maintenant : jour < aujourdhui} onouvrir={() => onouvrir(b.occ.id)} onjouer={() => onjouer(b.occ.id)} />
    {/each}

    {#if estAujourdhui}
      <div class="maintenant" style:top="{maintenant * PX}px" aria-label="Maintenant, {hm(maintenant)}">
        <span class="cote"><span class="pastille mono">{hm(maintenant)}</span></span>
        <span class="point"></span>
        <span class="ligne"></span>
      </div>
    {/if}
  </div>
</div>

<style>
  .defile-jour { flex: 1; min-height: 0; overflow-y: auto; position: relative; }
  .grille { position: relative; margin: 12px 0 28px; }
  .heure { position: absolute; left: 0; right: 0; display: flex; align-items: center; gap: 6px; pointer-events: none; }
  .heure .mono { width: 46px; text-align: right; font-size: 11px; color: var(--faint); }
  .heure .trait { flex: 1; height: 1px; background: var(--ligne); }
  .maintenant { position: absolute; left: 0; right: 0; height: 0; display: flex; align-items: center; z-index: 4; pointer-events: none; }
  .cote { width: 52px; display: flex; justify-content: flex-end; padding-right: 2px; }
  .pastille { background: var(--maintenant-pastille); color: var(--carte-texte); font-size: 11px; padding: 3px 6px; border-radius: 9px; letter-spacing: -0.02em; }
  .point { width: 10px; height: 10px; border-radius: 5px; background: var(--maintenant); margin-left: 1px; box-shadow: 0 0 0 3px var(--halo); flex: none; }
  .ligne { flex: 1; height: 2px; background: var(--maintenant); }
</style>
