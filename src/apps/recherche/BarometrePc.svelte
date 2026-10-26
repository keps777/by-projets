<script lang="ts">
  import { dollars } from './montants.ts';
  import Pictos from './Pictos.svelte';
  import { barometre, type LigneOffre } from './offres.ts';

  /** Baromètre du marché de la colonne de droite (PC) : même calcul que le mobile (`barometre`), calé sur toutes les offres de la recherche ; les points des offres filtrées s'estompent. */
  let { lignes, meilleureId, ids }: { lignes: LigneOffre[]; meilleureId?: string; ids: Set<string> } = $props();
  const baro = $derived(barometre(lignes, meilleureId));
  const echelleDescr = $derived(`Échelle de ${dollars(baro.echelle.min)} à ${dollars(baro.echelle.max)}. Offres : ${baro.points.map((p) => `${dollars(p.prix)}${p.meilleure ? ' (meilleure affaire)' : ''}`).join(', ')}.${baro.neuf !== null ? ` Prix équivalent neuf : ${dollars(baro.neuf)}.` : ''}`);
  const cacher = (pos: number) => (pos < 12 ? 0 : pos > 88 ? 100 : 50);
</script>

<section aria-labelledby="baro-pc-titre" class="baro">
  <div class="b-ent"><h2 id="baro-pc-titre">Baromètre du marché</h2><span class="b-sub">Prix indicatifs</span></div>
  <p class="b-txt">
    {#if baro.sousNeuf > 0}<span class="m">{baro.sousNeuf}</span> offre{baro.sousNeuf > 1 ? 's' : ''} sous le prix équivalent neuf, dès <span class="m">{dollars(baro.des!)}</span>.
    {:else}Aucune offre sous le prix équivalent neuf pour l’instant{#if baro.des !== null}, dès <span class="m">{dollars(baro.des)}</span>{/if}.{/if}
  </p>
  <div role="img" aria-label={echelleDescr} class="ech">
    <span class="axe"></span><span class="bande" style="left:{baro.posMin}%;width:{baro.posMax - baro.posMin}%"></span>
    {#if baro.posNeuf !== null}<span class="neuf-l" style="left:{baro.posNeuf}%"></span><span class="neuf-t" style="right:{100 - baro.posNeuf}%">Neuf {dollars(baro.neuf!)}</span>{/if}
    {#each baro.points as p (p.id)}
      {#if p.meilleure}
        <span class="tag" style="left:{p.pos}%;transform:translateX(-{cacher(p.pos)}%)"><span class="tag-p">{dollars(p.prix)}</span><span class="tige"></span><span class="tag-d"></span></span>
      {:else}
        <span class="dot" class:neuf={p.type === 'neuf'} style="left:{p.pos}%;opacity:{ids.has(p.id) ? 1 : 0.6}"></span>
      {/if}
    {/each}
  </div>
  <div class="grad" aria-hidden="true">{#each baro.echelle.graduations as g (g.pos)}<span style="left:{g.pos}%">{dollars(g.prix)}</span>{/each}</div>
  {#if baro.masques > 0}<p class="b-pied"><Pictos nom="cadenas" taille={16} trait={2} />+ {baro.masques} drop{baro.masques > 1 ? 's' : ''} membres non affiché{baro.masques > 1 ? 's' : ''} : prix visible{baro.masques > 1 ? 's' : ''} avec le Pass NexG</p>{/if}
</section>

<style>
  .baro { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: #0b1b2e; color: #fff; }
  .b-ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; } h2 { margin: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #c9d3df; } .b-sub { font: 500 12px/16px 'Barlow', sans-serif; color: #c9d3df; }
  .b-txt { margin: 0; font: 400 15px/21px 'Barlow', sans-serif; color: #fff; } .m { font: 600 15px/21px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .ech { position: relative; height: 66px; margin: 0 12px; } .ech > span { position: absolute; }
  .axe { left: 0; right: 0; top: 47px; height: 2px; background: rgba(255, 255, 255, 0.18); } .bande { top: 45px; height: 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.22); }
  .neuf-l { top: 4px; height: 52px; border-left: 2px dashed #c9d3df; } .neuf-t { top: 2px; margin-right: 8px; font: 500 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: #c9d3df; white-space: nowrap; }
  .dot { top: 42px; width: 12px; height: 12px; box-sizing: border-box; border-radius: 999px; background: #c9d3df; border: 2px solid #0b1b2e; transform: translateX(-50%); } .dot.neuf { background: #fff; }
  .tag { top: 0; display: flex; flex-direction: column; align-items: center; } .tag-p { height: 24px; padding: 0 8px; display: flex; align-items: center; border-radius: 6px; background: var(--signal); color: #0b1b2e; font: 600 12px/1 'IBM Plex Mono', ui-monospace, monospace; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .tige { width: 2px; height: 14px; background: var(--signal); } .tag-d { width: 18px; height: 18px; box-sizing: border-box; border-radius: 999px; background: var(--signal); border: 3px solid #0b1b2e; }
  .grad { position: relative; height: 16px; margin: 0 12px; font: 400 11px/16px 'IBM Plex Mono', ui-monospace, monospace; color: #c9d3df; font-variant-numeric: tabular-nums; } .grad span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
  .b-pied { margin: 0; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.12); display: flex; align-items: center; gap: 8px; font: 400 13px/18px 'Barlow', sans-serif; color: #c9d3df; } .b-pied :global(svg) { flex: none; color: var(--signal); }
</style>
