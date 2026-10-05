<script lang="ts">
  // Graphique du mois : une barre par jour, la ligne pointillée de l'objectif quotidien (planche SousProjet).
  import type { BarreJour } from './vues.ts';
  let { barres, objectif, libelleObjectif, decrire }: { barres: BarreJour[]; objectif: number | null; libelleObjectif: string; decrire: (b: BarreJour) => string } = $props();

  const H = 104;
  const max = $derived(Math.max(objectif != null ? objectif * 1.4 : 0, ...barres.map((b) => b.valeur ?? 0), 1));
  const hauteur = (b: BarreJour) => (b.etat === 'avenir' || b.etat === 'zero' || !b.valeur ? 4 : Math.max(4, Math.round((b.valeur / max) * H)));
  const haut = $derived(objectif != null ? Math.round(H - (objectif / max) * H) : null);
  const n = $derived(barres.length);
</script>

<div class="graphique" role="img" aria-label="Graphique du mois, une barre par jour">
  {#if haut != null}
    <span class="objectif" style:top="{haut}px"></span>
    <span class="mono libelle" style:top="{Math.max(0, haut - 14)}px">obj. {libelleObjectif}</span>
  {/if}
  <div class="barres" style:grid-template-columns="repeat({n}, minmax(0, 1fr))">
    {#each barres as b (b.jour)}
      <span class="barre {b.etat}" style:height="{hauteur(b)}px" title={decrire(b)}></span>
    {/each}
  </div>
</div>
<div class="axe mono"><span>1</span><span>10</span><span>20</span><span>{n}</span></div>

<style>
  .graphique { position: relative; height: 104px; margin-top: 6px; }
  .objectif { position: absolute; left: 0; right: 0; border-top: 1.5px dashed var(--muted); opacity: 0.7; }
  .libelle { position: absolute; right: 0; font-size: 10px; color: var(--muted); }
  .barres { position: absolute; inset: 0; display: grid; gap: 2px; align-items: end; }
  .barre { border-radius: 2px; background: var(--c); }
  .barre.atteint { background: var(--bon); }
  .barre.zero { background: var(--mauvais); }
  .barre.avenir { background: var(--piste); }
  .barre.aujourdhui { opacity: 0.55; }
  .axe { display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); }
</style>
