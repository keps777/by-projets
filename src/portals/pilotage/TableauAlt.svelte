<script lang="ts">
  /** Tableau alternatif d'un graphique (lecteurs d'écran, copie des chiffres). */
  let { legende, colonnes, lignes }: { legende: string; colonnes: string[]; lignes: (string | number)[][] } = $props();
</script>

<details class="alt">
  <summary>Voir les données en tableau</summary>
  <div class="defile">
    <table>
      <caption class="sr">{legende}</caption>
      <thead><tr>{#each colonnes as c, i (i)}<th scope="col" class:num={i > 0}>{c}</th>{/each}</tr></thead>
      <tbody>{#each lignes as l, k (k)}<tr>{#each l as v, i (i)}{#if i === 0}<th scope="row" class="cap">{v}</th>{:else}<td class="num mono">{v}</td>{/if}{/each}</tr>{/each}</tbody>
    </table>
  </div>
</details>

<style>
  .alt { font-size: 13.5px; } summary { min-height: 44px; display: flex; align-items: center; color: var(--primaire); font-weight: 600; cursor: pointer; }
  .defile { overflow-x: auto; border: 1px solid var(--ligne); border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; } th, td { padding: 8px 12px; border-bottom: 1px solid var(--ligne); white-space: nowrap; text-align: left; }
  thead th { font: 500 11px var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); background: var(--carte2); } .num { text-align: right; }
  tr:last-child > * { border-bottom: 0; } th[scope='row'] { font-weight: 600; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
