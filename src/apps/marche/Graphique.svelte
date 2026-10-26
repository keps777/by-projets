<script lang="ts">
  import { fmt } from '../../core/argent.ts';
  import { GEO, lignesTableau, tracer, type Trace } from './cours.ts';
  /** Graphique de cours : meilleure offre (si elle existe), prix neuf = plafond en pointillés, transactions en barres. Un tableau alternatif donne les mêmes valeurs. */
  let { offre, neuf, volumes, reperes, description, hausse = false, maintenant }: { offre?: number[]; neuf: number[]; volumes: number[]; reperes: [string, string, string]; description: string; hausse?: boolean; maintenant: number } = $props();
  const t: Trace = $derived(tracer(offre, neuf, volumes));
  const couleur = $derived(hausse ? 'var(--up)' : 'var(--down)');
  const lignes = $derived(lignesTableau(offre, neuf, maintenant));
  const yEtiquette = $derived(Math.max(0, t.yNeuf - 22));
</script>

<figure class="graphique">
  <svg viewBox="0 0 348 214" role="img" aria-label={description} width="100%">
    <path d={t.grille} fill="none" stroke="#1a1d23" stroke-width="1" />
    {#if offre}<path d={t.aire} style="fill: {couleur}" fill-opacity="0.10" stroke="none" />{/if}
    <path d={t.neuf} fill="none" stroke="#b9bec9" stroke-width="1.5" stroke-dasharray="5 5" />
    {#if offre}<path d={t.ligne} fill="none" style="stroke: {couleur}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" />{/if}
    <path d={t.barres} fill="#3a3f4b" stroke="none" /><path d={t.derniere} fill="#8c93a3" stroke="none" />
    <circle cx={t.dernierX} cy={t.dernierY} r="9" style="fill: {couleur}" fill-opacity="0.25" class="pouls" />
    <circle cx={t.dernierX} cy={t.dernierY} r="4" style="fill: {couleur}" />
    {#each t.graduations as g}<text x="342" y={g.y + 4} text-anchor="end" class="grad">{g.texte}</text>{/each}
    <rect x="212" y={yEtiquette} width="76" height="17" rx="4" fill="#060708" /><text x="286" y={yEtiquette + 12.5} text-anchor="end" class="neuf">Neuf = plafond</text>
    <g class="ticks"><text x={GEO.X0} y="210" text-anchor="start">{reperes[0]}</text><text x={(GEO.X0 + GEO.X1) / 2} y="210" text-anchor="middle">{reperes[1]}</text><text x={GEO.X1} y="210" text-anchor="end">{reperes[2]}</text></g>
  </svg>
</figure>
<ul class="legende" aria-hidden="true">
  {#if offre}<li><span class="trait" style="border-top-color: {couleur}"></span>Meilleure offre</li>{/if}
  <li><span class="trait tirets"></span>Prix neuf = plafond</li>
  <li><span class="barre"></span>Transactions</li>
</ul>
<details class="alt">
  <summary>Voir les valeurs en tableau</summary>
  <table>
    <caption class="sr">Prix par jour sur la période</caption>
    <thead><tr><th scope="col">Jour</th>{#if offre}<th scope="col">Meilleure offre</th>{/if}<th scope="col">Prix neuf</th></tr></thead>
    <tbody>{#each lignes as l}<tr><th scope="row">{l.jour}</th>{#if offre}<td>{l.offre !== undefined ? fmt(l.offre) : '—'}</td>{/if}<td>{fmt(l.neuf)}</td></tr>{/each}</tbody>
  </table>
</details>

<style>
  .graphique { margin: 0; border-radius: 16px; background: #060708; border: 1px solid var(--line); padding: 10px 0 4px; overflow: hidden; }
  svg { display: block; height: auto; }
  .grad { font: 11px 'IBM Plex Mono', ui-monospace, monospace; fill: #8c93a3; font-variant-numeric: tabular-nums; }
  .neuf { font: 600 11px 'Barlow', sans-serif; fill: #b9bec9; }
  .ticks text { font: 11px 'IBM Plex Mono', ui-monospace, monospace; fill: #8c93a3; }
  .pouls { animation: nx-pulse 1.6s ease-in-out infinite; }
  .legende { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0; padding: 0; list-style: none; font-size: 12px; color: var(--ink2); }
  .legende li { display: inline-flex; align-items: center; gap: 6px; }
  .trait { width: 16px; height: 0; border-top: 2px solid; } .trait.tirets { border-top: 2px dashed #b9bec9; }
  .barre { width: 8px; height: 12px; background: #3a3f4b; border-radius: 1px; }
  .alt { font-size: 13px; color: var(--ink2); }
  summary { display: flex; align-items: center; min-height: 44px; cursor: pointer; color: var(--ink2); font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font: 13px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  th, td { padding: 8px 6px; text-align: right; border-top: 1px solid var(--line); font-weight: 500; } th[scope='col'] { font: 700 11px 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); border-top: 0; }
  th:first-child, td:first-child { text-align: left; } th[scope='row'] { color: var(--ink2); }
</style>
