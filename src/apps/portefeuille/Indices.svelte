<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fmt, fmtPct } from '../../core/argent.ts';
  import { extremes, indicesParZone, niveauChaleur, pointsSerie, PERIODES, routesDepuis, type Periode, type RouteIndice } from '../../core/indices.ts';
  import { va } from '../voyager/lien.ts';
  import { mouvementReduit, tempsReel } from '../voyager/temps.svelte.ts';
  import Pic from './Pic.svelte';

  /** Indices NexG (verso, nuit) : prix équivalents par région au départ de Montréal (base 100 = début des courbes), variations 7 j / 30 j / 90 j, carte de chaleur des routes. Tout est calculé depuis `Vol.courbe`. */
  const temps = tempsReel(60_000);
  const zones = $derived(indicesParZone(app.monde, temps.maintenant));
  const routes = $derived(routesDepuis(app.monde, temps.maintenant));
  let periode = $state<Periode>(30);
  let pause = $state(mouvementReduit());
  const LONG: Record<Periode, string> = { 7: 'sur 7 jours', 30: 'sur 30 jours', 90: 'sur 90 jours' };
  const COURT: Record<Periode, string> = { 7: 'sur 7 j', 30: 'sur 30 j', 90: 'sur 90 j' };
  const ext = $derived(extremes(routes, periode));
  const bandeau = $derived([...routes].sort((a, b) => b.prix - a.prix).slice(0, 8));
  const ton = (v: number) => (v < 0 ? 'baisse' : v > 0 ? 'hausse' : 'stable');
  const UPS = ['#142430', '#1D5A82', '#3A9BD9', '#8FD8FF'], DNS = ['#2B1F18', '#7A3E17', '#E07A36', '#FFB585'], ENCRE = ['#F3F4F6', '#F3F4F6', '#0D0E11', '#0D0E11'];
  const tuile = (v: number) => { const n = Math.abs(niveauChaleur(v)); return v === 0 ? { bg: '#1D2027', fg: '#F3F4F6' } : { bg: (v > 0 ? UPS : DNS)[n], fg: ENCRE[n] }; };
  const sparkOf = (serie: number[]) => pointsSerie(serie.slice(-(periode + 1)), 140, 56, 5);
  const regions = $derived(zones.map((z) => ({ nom: z.zone, tuiles: z.routes })));
  const aria = (r: RouteIndice) => `${r.code}, ${r.ville}, ${fmtPct(r.variation[periode])} ${LONG[periode]}. Voir le cours.`;
</script>

<Ecran titre="Indices NexG" face="nuit" large>
  <section class="bandeau" aria-label="Prix équivalents des principales routes, variation sur 24 h">
    <span class="b-lib">24 h</span>
    <div class="vue"><div class="piste" class:pause>
      {#each [0, 1] as copie (copie)}
        <ul class="serie" aria-hidden={copie === 1 ? 'true' : undefined}>
          {#each bandeau as r (r.code)}<li><span class="r">YUL→{r.code}</span><span class="p">{fmt(r.prix)}</span><span class="d {ton(r.variation24h)}">{fmtPct(r.variation24h)}</span></li>{/each}
        </ul>
      {/each}
    </div></div>
    <button type="button" class="pause-btn" aria-label={pause ? 'Reprendre le défilement' : 'Mettre le défilement en pause'} aria-pressed={pause} onclick={() => (pause = !pause)}><Pic nom={pause ? 'lecture' : 'pause'} taille={18} /></button>
  </section>

  <section class="intro">
    <p class="t-sur">Au départ de Montréal (YUL)</p>
    <h1 class="t-h1">Le prix du voyage, région par région</h1>
    <p class="t-sec grand">Base 100 = prix équivalent il y a 90 jours, début des courbes. Un indice de 112,4 signifie un prix équivalent neuf 12,4 % plus élevé qu’à cette date.</p>
  </section>

  <div class="periodes" role="group" aria-label="Période de variation">
    {#each PERIODES as p (p)}<button type="button" aria-pressed={periode === p} onclick={() => (periode = p)}>{p} j</button>{/each}
  </div>

  <section class="indices" aria-label="Indices régionaux">
    {#each zones as z (z.zone)}
      {@const v = z.variation[periode]}{@const sp = sparkOf(z.serie)}
      <article class="indice">
        <div class="i-haut">
          <span class="lettres" aria-hidden="true">{#each z.sigle.split('') as c, i (i)}<span>{c}</span>{/each}</span>
          <div class="col mn"><h2>{z.nom}</h2><span class="i-routes">{z.routes.map((r) => r.ville).join(', ')}</span></div>
        </div>
        <div class="i-corps">
          <div class="col g4"><span class="valeur">{z.valeur.toFixed(1).replace('.', ',')}</span><span class="i-var"><span class="chg {ton(v)}"><Pic nom={v < 0 ? 'baisse' : 'hausse'} taille={14} />{fmtPct(v)}</span>{COURT[periode]}</span></div>
          {#if sp}<svg width="140" height="56" viewBox="0 0 140 56" aria-hidden="true" class="spark"><line x1="5" y1={sp.debutY} x2="135" y2={sp.debutY} stroke="var(--line-strong)" stroke-dasharray="3 3" /><polyline points={sp.points} fill="none" stroke={v < 0 ? 'var(--down)' : 'var(--up)'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /><circle cx={sp.fin.x} cy={sp.fin.y} r="3.5" fill={v < 0 ? 'var(--down)' : 'var(--up)'} /></svg>{/if}
        </div>
        <p class="i-ytd"><span>Depuis l’origine de l’indice (90 j)</span><span class="chg {ton(z.depuisBase)}">{fmtPct(z.depuisBase)}</span></p>
      </article>
    {:else}
      <p class="vide" role="status">Aucun indice à calculer : aucune route n’est au programme au départ de Montréal.</p>
    {/each}
  </section>

  <section class="chaleur" aria-labelledby="hm-t">
    <div class="col g4"><h2 id="hm-t" class="t-section">Carte de chaleur des routes</h2><p class="t-sec">Variation {LONG[periode]} · touchez une route pour voir son cours</p></div>
    <div class="extremes">
      <div><span class="e-l">Plus forte hausse</span><span class="e-v">{#if ext.hausse}<span>{ext.hausse.code}</span> <span class="chg hausse">{fmtPct(ext.hausse.variation[periode])}</span>{:else}Aucune{/if}</span></div>
      <div><span class="e-l">Plus forte baisse</span><span class="e-v">{#if ext.baisse}<span>{ext.baisse.code}</span> <span class="chg baisse">{fmtPct(ext.baisse.variation[periode])}</span>{:else}Aucune{/if}</span></div>
    </div>
    {#each regions as r (r.nom)}
      <div class="col g6"><h3 class="t-sur">{r.nom}</h3>
        <div class="tuiles">
          {#each r.tuiles as t (t.code)}{@const c = tuile(t.variation[periode])}
            <a class="tuile" href="/cours/{t.volId}" onclick={(e) => va(e, `/cours/${t.volId}`)} aria-label={aria(t)} style:background={c.bg} style:color={c.fg}><span class="t-code">{t.code}</span><span class="t-ville">{t.ville}</span><span class="t-chg">{fmtPct(t.variation[periode])}</span></a>
          {/each}
        </div></div>
    {/each}
    <div class="legende"><div class="degrade" aria-hidden="true">{#each ['#FFB585', '#E07A36', '#7A3E17', '#2B1F18', '#142430', '#1D5A82', '#3A9BD9', '#8FD8FF'] as c (c)}<span style:background={c}></span>{/each}</div>
      <p class="l-bornes"><span>Baisse ≤ −15 %</span><span>0</span><span>Hausse ≥ +15 %</span></p><p class="t-aide">Plus la tuile est claire, plus la variation est forte. Le signe indique le sens.</p></div>
  </section>
  <p class="t-aide">Indices calculés sur le prix équivalent neuf, depuis les courbes des 90 derniers jours. Un droit de voyage n’est pas un placement financier.</p>
</Ecran>

<style>
  .col { display: flex; flex-direction: column; min-width: 0; } .g4 { gap: 4px; } .g6 { gap: 6px; } .mn { min-width: 0; flex: 1; }
  .t-section { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .bandeau { contain: inline-size; display: flex; align-items: center; margin: -4px -20px 0; background: #060708; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .b-lib { flex: none; display: flex; align-items: center; height: 44px; padding: 0 10px 0 14px; border-right: 1px solid var(--line); font: 700 11px/1 'Barlow', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink3); }
  .vue { flex: 1; min-width: 0; height: 44px; overflow: hidden; display: flex; align-items: center; } .piste { display: flex; width: max-content; animation: nx-ticker 40s linear infinite; } .piste.pause { animation-play-state: paused; }
  .serie { display: flex; gap: 22px; margin: 0; padding: 0 11px; list-style: none; font: 400 13px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; } .serie li { display: flex; gap: 6px; } .r { color: var(--ink2); } .p, .d { font-weight: 600; }
  .d.hausse, .chg.hausse { color: var(--up); } .d.baisse, .chg.baisse { color: var(--down); } .d.stable, .chg.stable { color: var(--ink2); }
  .pause-btn { flex: none; width: 44px; height: 44px; border: 0; border-left: 1px solid var(--line); background: #060708; color: var(--ink2); display: grid; place-items: center; cursor: pointer; }
  .intro { display: flex; flex-direction: column; gap: 8px; } .intro h1 { font: 600 34px/34px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; text-wrap: balance; } .grand { font-size: 14px; line-height: 20px; }
  .periodes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
  .periodes button { min-height: 44px; border: 0; border-radius: 12px; background: transparent; color: var(--ink2); font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; cursor: pointer; } .periodes button[aria-pressed='true'] { background: var(--ink); color: #0d0e11; }
  .indices { display: flex; flex-direction: column; gap: 12px; }
  .indice { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .i-haut { display: flex; align-items: center; gap: 12px; } .lettres { display: flex; gap: 3px; } .lettres span { width: 22px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: #1c1f25; box-shadow: inset 0 -15px 0 #15171b; font: 600 17px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--accent); }
  .i-haut h2 { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; } .i-routes { font-size: 12px; color: var(--ink3); overflow-wrap: anywhere; }
  .i-corps { min-width: 0; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; } .valeur { font: 600 40px/42px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .i-var { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--ink2); } .chg { display: inline-flex; align-items: center; gap: 3px; font: 600 15px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .spark { flex: 0 1 140px; min-width: 0; max-width: 42%; height: auto; }
  .i-ytd { display: flex; justify-content: space-between; gap: 8px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 12px; color: var(--ink3); } .i-ytd .chg { font-size: 12px; }
  .vide { padding: 16px; border-radius: 16px; border: 1px dashed var(--line-strong); color: var(--ink2); }
  .chaleur { display: flex; flex-direction: column; gap: 12px; }
  .extremes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .extremes > div { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); } .e-l { font-size: 12px; color: var(--ink3); } .e-v { font: 600 15px/20px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .e-v .chg { font-size: 15px; }
  .tuiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .tuile { display: flex; flex-direction: column; justify-content: space-between; gap: 2px; min-height: 78px; padding: 8px; box-sizing: border-box; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.06); text-decoration: none; }
  .t-code { font: 700 22px/22px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; } .t-ville { font: 600 12px/16px 'Barlow', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .t-chg { font: 600 13px/16px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .tuile:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .legende { display: flex; flex-direction: column; gap: 6px; } .degrade { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; height: 12px; } .degrade span:first-child { border-radius: 3px 0 0 3px; } .degrade span:last-child { border-radius: 0 3px 3px 0; }
  .l-bornes { display: flex; justify-content: space-between; gap: 8px; font: 400 11px/14px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); }
  @media (min-width: 900px) {
    .bandeau { margin: 0; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
    .intro { max-width: 760px; } .intro h1 { font-size: 44px; line-height: 44px; }
    .periodes { width: 360px; }
    .indices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    .chaleur { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; row-gap: 16px; align-items: start; }
    .chaleur > .col:first-child, .extremes, .legende { grid-column: 1 / -1; } .extremes { max-width: 520px; }
    .tuiles { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
</style>
