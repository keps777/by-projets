<script lang="ts">
  import Defile from './Defile.svelte';
  /** Courbe en SVG maison, accessible : titre + description lus par les lecteurs d'écran, et le même contenu en tableau (« Voir les valeurs »). */
  export interface Serie { nom: string; valeurs: number[]; couleur?: string; tirets?: boolean; aire?: boolean }
  let { titre, description, labels, series, seuil, alertes = [], format = (n: number) => String(Math.round(n)), unite = '', hauteur = 180, pasLabels = 1 }: {
    titre: string; description: string; labels: string[]; series: Serie[]; seuil?: { valeur: number; libelle: string }; /** Indices de la première série à marquer en rouge. */ alertes?: number[];
    format?: (n: number) => string; unite?: string; hauteur?: number; pasLabels?: number;
  } = $props();
  const uid = $props.id();
  const L = 600, H = 180, marge = 10;
  const max = $derived(Math.max(1, seuil?.valeur ?? 0, ...series.flatMap((s) => s.valeurs)) * 1.08);
  const n = $derived(Math.max(...series.map((s) => s.valeurs.length), 2));
  const x = (i: number) => (i / (n - 1)) * L;
  const y = (v: number) => H - marge - (v / max) * (H - 2 * marge);
  const chemin = (v: number[]) => v.map((val, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(val).toFixed(1)}`).join(' ');
  const couleurs = ['#3DE0FF', 'rgba(255,255,255,.45)'];
  const resume = $derived(series.map((s) => { const v = s.valeurs; const m = Math.max(...v); return `${s.nom} : de ${format(Math.min(...v))}${unite} à ${format(m)}${unite}, dernier point ${format(v[v.length - 1])}${unite}`; }).join(' ; '));
</script>

<div class="chart" style="height: {hauteur}px">
  <svg viewBox="0 0 {L} {H}" preserveAspectRatio="none" role="img" aria-labelledby="{uid}-t {uid}-d">
    <title id="{uid}-t">{titre}</title><desc id="{uid}-d">{description} {resume}.</desc>
    {#if seuil}<line x1="0" x2={L} y1={y(seuil.valeur)} y2={y(seuil.valeur)} stroke="rgba(255,107,107,.55)" stroke-dasharray="6 6" vector-effect="non-scaling-stroke" />{/if}
    {#each series as s, k (s.nom)}
      {#if s.aire}<path d="{chemin(s.valeurs)} L{x(s.valeurs.length - 1)} {H} L0 {H}Z" fill="rgba(61,224,255,.18)" />{/if}
      <path d={chemin(s.valeurs)} fill="none" stroke={s.couleur ?? couleurs[k % 2]} stroke-width={s.tirets ? 2 : 3} stroke-linejoin="round" stroke-dasharray={s.tirets ? '6 6' : undefined} vector-effect="non-scaling-stroke" />
    {/each}
  </svg>
  {#each alertes as i (i)}<span aria-hidden="true" style="position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#FF6B6B;left:{(x(i) / L) * 100}%;top:{(y(series[0].valeurs[i]) / H) * 100}%"></span>{/each}
</div>
<div class="axe" aria-hidden="true">{#each labels as l, i (i)}<span style="visibility:{i % pasLabels === 0 ? 'visible' : 'hidden'}">{l}</span>{/each}</div>
{#if series.length > 1 || seuil}<div class="legende" aria-hidden="true">{#each series as s, k (s.nom)}<span style="color:{s.couleur ?? couleurs[k % 2]}">{s.tirets ? '┄' : '●'} {s.nom}</span>{/each}{#if seuil}<span style="color:#FF8A8A">┄ {seuil.libelle}</span>{/if}</div>{/if}
<details class="alt">
  <summary>Voir les valeurs en tableau</summary>
  <Defile label="Valeurs de la courbe : {titre}"><table class="tbl"><caption class="sr">{titre}</caption><thead><tr><th scope="col">Repère</th>{#each series as s (s.nom)}<th scope="col" class="r">{s.nom}</th>{/each}</tr></thead>
    <tbody>{#each labels as l, i (i)}<tr><th scope="row">{l}</th>{#each series as s (s.nom)}<td class="r mono">{s.valeurs[i] === undefined ? '—' : `${format(s.valeurs[i])}${unite}`}{alertes.includes(i) && s === series[0] ? ' ▲' : ''}</td>{/each}</tr>{/each}</tbody></table></Defile>
</details>
