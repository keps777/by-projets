<script lang="ts">
  import { dollars } from './montants.ts';
  import Pictos from './Pictos.svelte';
  import { fmtJourCourt } from './dates.ts';
  import { AXE, depuisMois, depuisMoisCourt, etiquettesAxe, HAUTEUR, LARGEUR, lignesTable, pointsDeCourbe, resumeCourbe, variation } from './courbe.ts';

  /** Graphique « Prix équivalent » : courbe SVG des 90 derniers jours du vol, prix demandé en pointillé, résumé et tableau des valeurs pour les lecteurs d'écran. */
  let { courbe, prixDemande, etiquetteDemande = 'Prix demandé', aujourdhui }: { courbe: number[]; prixDemande?: number; etiquetteDemande?: string; aujourdhui: string } = $props();
  const g = $derived(pointsDeCourbe(courbe, prixDemande)), v = $derived(variation(courbe)), axe = $derived(etiquettesAxe(courbe, aujourdhui));
  const prixActuel = $derived(courbe.length ? courbe[courbe.length - 1] : 0), table = $derived(lignesTable(courbe, aujourdhui));
  const resume = $derived(resumeCourbe(courbe, prixDemande, aujourdhui)), depuis = $derived(depuisMois(courbe.length, aujourdhui));
</script>
<section aria-labelledby="curve-title" class="courbe">
  <div class="ent"><h2 id="curve-title">Prix équivalent depuis {depuis}</h2><span class="ind">Indicatif</span></div>
  <div class="vals"><span class="prix">{dollars(prixActuel)}</span>
    <span class="var" class:hausse={v.sens === 'hausse'} class:baisse={v.sens === 'baisse'}>{#if v.sens !== 'stable'}<Pictos nom={v.sens === 'hausse' ? 'hausse' : 'baisse'} taille={14} trait={2.25} />{/if}{v.texte} depuis {depuisMoisCourt(courbe.length, aujourdhui)}</span></div>
  <div class="graph" role="img" aria-label={resume}>
    <svg width="100%" height={HAUTEUR} viewBox="0 0 {LARGEUR} {HAUTEUR}" preserveAspectRatio="none" aria-hidden="true" style="display:block">
      <line x1="0" y1={AXE} x2={LARGEUR} y2={AXE} stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke" />
      {#if g.yPrix !== null}<line x1="0" y1={g.yPrix} x2={LARGEUR} y2={g.yPrix} stroke="var(--ink3)" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />{/if}
      <polyline points={g.points} fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" />
    </svg>
    <span class="fin" aria-hidden="true" style="top:{g.fin.y - 5}px"></span>
    {#if g.yPrix !== null && prixDemande !== undefined}<span class="demande" aria-hidden="true" style="top:{Math.max(0, g.yPrix - 22)}px">{etiquetteDemande} <span class="mono">{dollars(prixDemande)}</span></span>{/if}
  </div>
  <div class="axe" aria-hidden="true">{#each axe as e, i (i)}<span>{e}</span>{/each}</div>
  <details class="valeurs"><summary>Voir les valeurs</summary>
    <table><caption class="sr">Prix équivalent neuf, une valeur toutes les deux semaines</caption><thead><tr><th scope="col">Jour</th><th scope="col">Prix équivalent</th></tr></thead>
      <tbody>{#each table as l, i (l.jour)}<tr><th scope="row">{i === table.length - 1 ? 'Aujourd’hui' : fmtJourCourt(l.jour)}</th><td>{dollars(l.prix)}</td></tr>{/each}</tbody></table>
  </details>
</section>
<style>
  .courbe { display: flex; flex-direction: column; gap: 10px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; } h2 { margin: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); } .ind { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); flex: none; }
  .vals { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; } .prix { font: 600 22px/28px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .var { display: inline-flex; align-items: center; gap: 3px; font: 600 13px/18px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; color: var(--ink2); } .var.hausse { color: var(--up); } .var.baisse { color: var(--down); }
  .graph { position: relative; } .fin { position: absolute; right: -2px; width: 10px; height: 10px; box-sizing: border-box; border-radius: 999px; background: var(--accent); border: 2px solid var(--surface); }
  .demande { position: absolute; left: 0; font: 600 12px/16px 'Barlow', sans-serif; color: var(--ink2); background: var(--surface); padding-right: 6px; } .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .axe { display: flex; justify-content: space-between; gap: 4px; font: 500 12px/16px 'Barlow', sans-serif; color: var(--ink2); }
  .valeurs summary { display: flex; align-items: center; min-height: 44px; color: var(--accent); font: 600 14px/18px 'Barlow', sans-serif; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; font: 400 14px/20px 'Barlow', sans-serif; } th, td { padding: 8px 0; border-top: 1px solid var(--line); text-align: left; } td { text-align: right; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } thead th { font-weight: 600; color: var(--ink2); } tbody th { font-weight: 500; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
