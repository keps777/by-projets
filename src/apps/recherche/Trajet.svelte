<script lang="ts">
  import type { Vol } from '../../domain/types.ts';
  import { fmtDuree, fmtEscales } from './dates.ts';
  /** Ligne horaires d'une carte d'offre : départ, durée et escales, arrivée (« +1 » = lendemain). Les chiffres viennent du vol. */
  let { vol }: { vol: Vol } = $props();
  const direct = $derived(vol.escales.length === 0);
</script>
<div class="trajet">
  <div class="col g4"><span class="heure">{vol.heureDepart}</span><span class="code">{vol.de}</span></div>
  <div class="milieu">
    <span class="duree">{fmtDuree(vol.dureeMin)}</span>
    <span class="fil" aria-hidden="true"><span class="pointille"></span>{#if direct}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h6l4 7h2l-2-7h5l2 2h2l-1-3 1-3h-2l-2 2h-5l2-7h-2l-4 7H3z" /></svg>{:else}<span class="escale"></span>{/if}<span class="pointille"></span></span>
    <span class="escales">{fmtEscales(vol.escales)}</span>
  </div>
  <div class="col arrivee"><span class="h2"><span class="heure">{vol.heureArrivee}</span>{#if vol.plusJours > 0}<span class="plus" aria-label="le lendemain">+{vol.plusJours}</span>{/if}</span><span class="code">{vol.vers}</span></div>
</div>
<style>
  .trajet { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; }
  .col { display: flex; flex-direction: column; } .g4 { gap: 2px; } .arrivee { align-items: flex-end; gap: 2px; }
  .heure { font: 600 20px/24px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .code { font: 600 13px/16px 'Barlow', sans-serif; letter-spacing: 0.06em; color: var(--ink2); }
  .h2 { display: flex; align-items: flex-start; gap: 2px; } .plus { font: 600 12px/14px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); }
  .milieu { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
  .duree { font: 500 13px/16px 'Barlow', sans-serif; color: var(--ink2); } .escales { font: 600 13px/16px 'Barlow', sans-serif; color: var(--ink2); text-align: center; }
  .fil { display: flex; align-items: center; gap: 4px; width: 100%; color: var(--accent); } .pointille { flex: 1; border-top: 2px dotted var(--line-strong); }
  .escale { flex: none; width: 9px; height: 9px; border-radius: 999px; border: 2px solid var(--down); background: var(--surface); }
</style>
