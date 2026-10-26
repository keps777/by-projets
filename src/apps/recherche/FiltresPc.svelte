<script lang="ts">
  import { dollars } from './montants.ts';
  import type { TypeOffre } from '../../domain/marche.ts';
  import type { FiltresPc } from './filtresPc.ts';
  import Pictos from './Pictos.svelte';

  /** Colonne « Filtres » de la variante PC (résultats et marché) : sources avec compteurs, escales, revendabilité, prix maximum. Les changements s'appliquent tout de suite (pas de bouton « Appliquer »). */
  let { filtres = $bindable(), compteurs, bornes, ordre, onreset, prefixe = 'flt' }: { filtres: FiltresPc; compteurs: Record<TypeOffre, number>; bornes: { min: number; max: number }; ordre: TypeOffre[]; onreset: () => void; prefixe?: string } = $props();
  const LIBELLES: Record<TypeOffre, string> = { revente: 'Revente', neuf: 'Neuf', agence: 'Agences partenaires', drop: 'Drops membres' };
  const prix = $derived(filtres.prixMax ?? bornes.max);
</script>

<aside class="filtres" aria-labelledby="{prefixe}-titre">
  <div class="ent">
    <h2 id="{prefixe}-titre"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></svg>Filtres</h2>
    <button type="button" class="reset" onclick={onreset}>Réinitialiser</button>
  </div>
  <div role="group" aria-labelledby="{prefixe}-src" class="bloc">
    <h3 id="{prefixe}-src">Sources</h3>
    {#each ordre as t (t)}
      <button type="button" class="source" class:on={filtres.sources[t]} aria-pressed={filtres.sources[t]} onclick={() => (filtres.sources[t] = !filtres.sources[t])}>
        <span class="case" aria-hidden="true">{#if filtres.sources[t]}<Pictos nom="ok" taille={14} trait={3} />{/if}</span><span class="grow">{LIBELLES[t]}</span><span class="n" aria-label="{compteurs[t]} offre{compteurs[t] > 1 ? 's' : ''}">{compteurs[t]}</span>
      </button>
    {/each}
  </div>
  <div role="group" aria-labelledby="{prefixe}-esc" class="bloc g8">
    <h3 id="{prefixe}-esc">Escales</h3>
    <div class="seg"><button type="button" aria-pressed={!filtres.direct} class:on={!filtres.direct} onclick={() => (filtres.direct = false)}>Toutes</button><button type="button" aria-pressed={filtres.direct} class:on={filtres.direct} onclick={() => (filtres.direct = true)}>Direct seulement</button></div>
  </div>
  <div class="bloc g8">
    <h3>Revente</h3>
    <button type="button" role="switch" aria-checked={filtres.revendable} class="inter" onclick={() => (filtres.revendable = !filtres.revendable)}>
      <span class="col"><span class="t1">Revendable seulement</span><span class="t2">Masque les offres non revendables</span></span>
      <span class="piste" class:on={filtres.revendable} aria-hidden="true"><span class="bouton"></span></span>
    </button>
  </div>
  <div class="bloc g6">
    <div class="prix-l"><label for="{prefixe}-prix">Prix maximum</label><span class="pv">{dollars(prix)}</span></div>
    <input id="{prefixe}-prix" type="range" min={bornes.min} max={bornes.max} step="10" value={prix} oninput={(e) => { const v = Number(e.currentTarget.value); filtres.prixMax = v >= bornes.max ? null : v; }} />
    <div class="bornes"><span>{dollars(bornes.min)}</span><span>{dollars(bornes.max)}</span></div>
    <p class="aide">Les drops restent affichés : leur prix n’est visible qu’aux membres.</p>
  </div>
</aside>

<style>
  .filtres { display: flex; flex-direction: column; gap: 16px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); min-width: 0; }
  .ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; } h2 { margin: 0; display: flex; align-items: center; gap: 8px; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .reset { min-height: 44px; padding: 0 4px; border: 0; background: none; color: var(--accent); font: 700 14px/1 'Barlow', sans-serif; cursor: pointer; }
  .bloc { display: flex; flex-direction: column; gap: 4px; } .g8 { gap: 8px; } .g6 { gap: 6px; } .col { display: flex; flex-direction: column; gap: 2px; } .grow { flex: 1; min-width: 0; text-align: left; }
  h3, label { margin: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); } .bloc h3 { margin-bottom: 4px; } .g8 h3 { margin-bottom: 0; }
  .source { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 10px; border-radius: 12px; border: 1px solid var(--line); background: transparent; color: var(--ink); font: 600 15px/1.15 'Barlow', sans-serif; cursor: pointer; }
  .source.on { background: var(--bg); border-color: var(--line-strong); } .source .n { font: 400 13px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); }
  .case { flex: none; width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--ink3); background: transparent; color: var(--bg); display: flex; align-items: center; justify-content: center; } .on .case { background: var(--ink); border-color: var(--ink); }
  .seg { display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: var(--surface2); } .seg button { flex: 1; min-height: 44px; padding: 0 8px; border: 0; border-radius: 10px; background: transparent; color: var(--ink2); font: 700 14px/1.1 'Barlow', sans-serif; cursor: pointer; } .seg button.on { background: var(--ink); color: var(--bg); }
  .inter { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 52px; padding: 6px 10px; border-radius: 12px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); text-align: left; cursor: pointer; }
  .t1 { font: 600 15px/18px 'Barlow', sans-serif; } .t2 { font: 400 12px/15px 'Barlow', sans-serif; color: var(--ink2); }
  .piste { position: relative; flex: none; width: 44px; height: 24px; border-radius: 999px; background: var(--surface3); border: 1px solid var(--ink3); } .piste.on { background: var(--accent); border-color: var(--accent); }
  .bouton { position: absolute; top: 2px; left: 3px; width: 18px; height: 18px; border-radius: 999px; background: var(--ink2); transition: left 0.2s ease; } .piste.on .bouton { left: 21px; background: var(--on-signal); }
  [data-face='jour'] .piste.on .bouton { background: #fff; }
  .prix-l { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; } .pv { font: 600 15px/20px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  input[type='range'] { width: 100%; height: 36px; margin: 0; accent-color: var(--accent); cursor: pointer; }
  .bornes { display: flex; justify-content: space-between; font: 400 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); } .aide { margin: 0; font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink2); }
</style>
