<script lang="ts">
  import { cheminCourbe, echelle, pointsCourbe } from '../../core/pilotage.ts';
  import TableauAlt from './TableauAlt.svelte';
  import type { Serie } from './types.ts';
  let { titre, desc, libelles, series, format, hauteur = 230, unite = '' }: {
    titre: string; desc: string; libelles: string[]; series: Serie[]; format: (v: number) => string; hauteur?: number; unite?: string;
  } = $props();
  const gauche = 48, droite = 16, haut = 16, bas = 28, pas = 70;
  const larg = $derived(gauche + droite + Math.max(1, libelles.length - 1) * pas + 40);
  const ech = $derived(echelle(Math.max(0, ...series.flatMap((s) => s.valeurs))));
  const zone = $derived({ x0: gauche + 10, x1: larg - droite - 10, y0: hauteur - bas, y1: haut });
  const trace = $derived(series.map((s) => ({ s, pts: pointsCourbe(s.valeurs, zone, ech.max) })));
  const yDe = (v: number) => zone.y0 - ((zone.y0 - zone.y1) * v) / ech.max;
  const axe = (v: number) => (v >= 1e9 ? `${v / 1e9} Md` : v >= 1e6 ? `${v / 1e6} M` : v >= 1e3 ? `${v / 1e3} k` : String(v));
  const idt = $props.id();
</script>

<figure class="fig">
  <div class="def">
    <svg viewBox="0 0 {larg} {hauteur}" style:min-width="{larg}px" role="img" aria-labelledby="t{idt} d{idt}">
      <title id="t{idt}">{titre}</title><desc id="d{idt}">{desc}</desc>
      {#each ech.graduations as g (g)}
        <line x1={gauche} x2={larg - droite} y1={yDe(g)} y2={yDe(g)} class="grille" />
        <text x={gauche - 6} y={yDe(g) + 4} text-anchor="end" class="axe">{axe(g)}</text>
      {/each}
      {#each libelles as l, i (i)}<text x={trace[0]?.pts[i]?.x ?? 0} y={hauteur - 8} text-anchor="middle" class="axe">{l}</text>{/each}
      {#each trace as t (t.s.nom)}
        <path d={cheminCourbe(t.pts)} fill="none" stroke={t.s.couleur} stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={t.s.tirets} />
        {#each t.pts as p, i (i)}<circle cx={p.x} cy={p.y} r="4" fill="var(--carte)" stroke={t.s.couleur} stroke-width="2"><title>{t.s.nom}, {libelles[i]} : {format(t.s.valeurs[i])}</title></circle>{/each}
      {/each}
    </svg>
  </div>
  <ul class="legende">{#each series as s (s.nom)}<li><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke={s.couleur} stroke-width="3" stroke-dasharray={s.tirets} /></svg>{s.nom}</li>{/each}</ul>
  <TableauAlt legende={titre} colonnes={['Mois', ...series.map((s) => (unite ? `${s.nom} (${unite})` : s.nom))]} lignes={libelles.map((l, i) => [l, ...series.map((s) => format(s.valeurs[i]))])} />
</figure>

<style>
  .fig { display: flex; flex-direction: column; gap: 6px; } .def { overflow-x: auto; } .def svg { display: block; width: 100%; height: auto; }
  .grille { stroke: var(--ligne); } .axe { font: 11px var(--sans); fill: var(--muted); }
  .legende { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: var(--doux); } .legende li { display: flex; align-items: center; gap: 6px; }
</style>
