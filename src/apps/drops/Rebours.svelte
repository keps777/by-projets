<script lang="ts">
  import { annoncePalier, chiffresRebours } from './vues.ts';
  /** Compte à rebours en tuiles « tableau des départs » : minutes et secondes (heures en plus s'il en reste). Mis à jour chaque seconde ; le lecteur d'écran n'est averti qu'aux paliers (10, 5, 1 min, 30 s, 10 s, fin). */
  let { reste }: { reste: number } = $props();
  const r = $derived(chiffresRebours(reste));
  const avecHeures = $derived(r.groupes.length === 3);
  const annonce = $derived(annoncePalier(reste));
</script>
<div class="rebours" class:heures={avecHeures}>
  <div role="timer" aria-label={r.libelle} class="tuiles">
    {#each r.groupes as g, i (g.unite)}
      {#if i > 0}<span class="deux" aria-hidden="true" data-nx-motion="1">:</span>{/if}
      <span class="groupe" aria-hidden="true"><span class="paire">{#each g.chiffres as c, j (j)}<span class="tuile">{c}<span class="coupe"></span></span>{/each}</span><span class="unite">{g.unite}</span></span>
    {/each}
  </div>
  <p class="sr" aria-live="polite" aria-atomic="true">{annonce}</p>
</div>
<style>
  .rebours { --w: min(66px, 15.5vw); --h: clamp(52px, 9dvh, 84px); }
  .rebours.heures { --w: min(46px, 9.6vw); --h: clamp(48px, 8.5dvh, 68px); }
  .tuiles { display: flex; align-items: flex-start; justify-content: center; gap: 8px; } .heures .tuiles { gap: 4px; }
  .groupe { display: flex; flex-direction: column; align-items: center; gap: clamp(6px, 1.4dvh, 12px); } .paire { display: flex; gap: 6px; } .heures .paire { gap: 4px; }
  .tuile { position: relative; width: var(--w); height: var(--h); display: flex; align-items: center; justify-content: center; border-radius: 8px; background: #1c1f25; box-shadow: inset 0 calc(var(--h) / -2) 0 #15171b; font: 600 calc(var(--h) * 0.71) / 1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; color: #ffd23f; }
  .coupe { position: absolute; left: 0; right: 0; top: calc(var(--h) / 2 - 1px); height: 2px; background: #060708; }
  .deux { height: var(--h); width: clamp(14px, 7.7vw, 30px); display: flex; align-items: center; justify-content: center; font: 600 calc(var(--h) * 0.52) / 1 'IBM Plex Mono', ui-monospace, monospace; color: #ffd23f; animation: nx-pulse 1s ease-in-out infinite; }
  .heures .unite { font-size: 9px; letter-spacing: 0.06em; } .heures .deux { width: clamp(8px, 3.5vw, 14px); }
  .unite { font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: #8c93a3; }
</style>
