<script lang="ts">
  import { arcJauge } from '../../core/pilotage.ts';
  /** Jauge en demi-cercle : `valeur` sur `max`, repère du `seuil`. */
  let { valeur, max, seuil, titre, desc, texte, sous, alerte = false }: {
    valeur: number; max: number; seuil: number; titre: string; desc: string; texte: string; sous: string; alerte?: boolean;
  } = $props();
  const cx = 120, cy = 118, r = 92;
  const a = $derived(Math.PI * (1 - Math.min(1, seuil / max)));
  const idt = $props.id();
</script>

<svg viewBox="0 0 240 150" role="meter" aria-valuenow={valeur} aria-valuemin="0" aria-valuemax={max} aria-valuetext={desc} aria-labelledby="t{idt} d{idt}">
  <title id="t{idt}">{titre}</title><desc id="d{idt}">{desc}</desc>
  <path d={arcJauge(cx, cy, r, 1)} class="piste" />
  <path d={arcJauge(cx, cy, r, valeur / max)} class="val" class:alerte />
  <line x1={cx + (r - 14) * Math.cos(a)} y1={cy - (r - 14) * Math.sin(a)} x2={cx + (r + 12) * Math.cos(a)} y2={cy - (r + 12) * Math.sin(a)} class="seuil"><title>Seuil interne</title></line>
  <text x={cx} y={cy - 18} text-anchor="middle" class="grand">{texte}</text>
  <text x={cx} y={cy + 4} text-anchor="middle" class="petit">{sous}</text>
  <text x={cx - r} y={cy + 20} text-anchor="middle" class="axe">0</text><text x={cx + r} y={cy + 20} text-anchor="middle" class="axe">{max} %</text>
</svg>

<style>
  svg { width: 100%; max-width: 320px; height: auto; display: block; } path { fill: none; stroke-width: 18; stroke-linecap: round; }
  .piste { stroke: var(--carte2); } .val { stroke: var(--primaire); } .val.alerte { stroke: var(--alerte); } .seuil { stroke: var(--texte); stroke-width: 3; }
  .grand { font: 700 30px var(--sans); fill: var(--texte); } .petit { font: 12.5px var(--sans); fill: var(--muted); } .axe { font: 11px var(--sans); fill: var(--muted); }
</style>
