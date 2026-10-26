<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icone from '../../ui/Icone.svelte';
  /** Billet de la maquette (papier blanc, perforation) : trajet, compagnie et date ; `bas` remplace la ligne du bas. */
  let { de, vers, entete, depart, arrivee, ville, villeVers, duree, bas, label, compact = false }: { de: string; vers: string; entete: [string, string]; depart?: string; arrivee?: string; ville?: string; villeVers?: string; duree?: string; bas: Snippet; label: string; compact?: boolean } = $props();
</script>
<article class="billet" aria-label={label}>
  <div class="haut" class:compact>
    <div class="entete"><span>{entete[0]}</span><span>{entete[1]}</span></div>
    <div class="route"><span class="code">{de}</span><span class="fil" aria-hidden="true"><span class="pointille"></span><Icone nom="avion" taille={compact ? 18 : 20} /><span class="pointille"></span></span><span class="code">{vers}</span></div>
    {#if !compact && depart}<div class="horaires"><span><span class="h mono">{depart}</span><span class="v">{ville}</span></span><span class="duree">{duree}</span><span class="fin"><span class="h mono">{arrivee}</span><span class="v">{villeVers}</span></span></div>{/if}
  </div>
  <div class="perfore" aria-hidden="true"><span class="trait"></span><span class="g"></span><span class="d"></span></div>
  <div class="bas" class:compact>{@render bas()}</div>
</article>
<style>
  .billet { position: relative; border-radius: 18px; background: #fff; color: #121418; } .haut { padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 10px; } .haut.compact { padding: 14px 18px 12px; gap: 8px; }
  .entete { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #555c6b; }
  .route { display: flex; align-items: center; gap: 10px; } .code { font: 700 clamp(34px, 11vw, 44px)/40px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .compact .code { font-size: clamp(32px, 10vw, 40px); line-height: 38px; }
  .fil { flex: 1; display: flex; align-items: center; gap: 6px; color: #555c6b; } .pointille { flex: 1; border-top: 2px dotted #c9cdd5; }
  .horaires { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; gap: 8px; } .horaires > span { display: flex; flex-direction: column; gap: 1px; } .fin { align-items: flex-end; } .h { font-weight: 600; font-size: 17px; } .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .v { font-size: 13px; color: #555c6b; } .duree { padding-top: 3px; font-size: 12px; font-weight: 600; color: #555c6b; text-align: center; }
  .perfore { position: relative; height: 2px; } .trait { position: absolute; left: 16px; right: 16px; top: 0; border-top: 2px dashed #e2e4e9; } .g, .d { position: absolute; top: -10px; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .g { left: -11px; } .d { right: -11px; }
  .bas { padding: 12px 18px 16px; } .bas.compact { padding: 10px 18px 14px; }
</style>
