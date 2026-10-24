<script lang="ts">
  import type { Offre } from '../../core/recherche.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { duree } from '../../core/tranches.ts';
  /** Une ligne de départ (bus ou covoiturage) : pastille, heure · compagnie, détail, prix, étiquette. Même rendu dans le panorama et dans la liste. */
  let { o, actif, etiquette, onclick, colonne = false, focalisable = true }: {
    o: Offre; actif: boolean; etiquette: { texte: string; ton: string }; onclick: () => void; colonne?: boolean; focalisable?: boolean;
  } = $props();
  const cv = $derived(o.genre === 'cv');
  const sous = $derived(`${cv ? 'Covoit · ' : ''}${o.cl} · ${o.gare} · ${duree(o.dureeMin).replace(/ /g, '')}`);
  const aria = $derived(`${cv ? 'Covoiturage' : 'Bus'} ${o.heure} ${o.co}, ${o.cl}, ${o.gare}, ${fmtF(o.prix)}, ${o.complet ? 'complet' : `${o.places} place${o.places > 1 ? 's' : ''}`}${o.retardMin ? `, retard ${o.retardMin} minutes` : ''}${actif ? ', choisi' : ''}`);
</script>

<button type="button" class="bus" class:on={actif} class:cv class:colonne tabindex={focalisable ? undefined : -1} aria-pressed={actif} aria-label={aria} {onclick}>
  <span class="lg" class:cv style="background: {o.col}" aria-hidden="true">{o.ab}</span>
  <span class="col grow"><span class="nm ell">{o.heure} · {o.co}</span><span class="sb ell">{sous}</span></span>
  <span class="col rt"><span class="pr">{fmtF(o.prix)}</span><span class="bd2 {etiquette.ton}">{etiquette.texte}</span></span>
</button>

<style>
  .bus { display: flex; align-items: center; gap: 7px; width: 100%; min-height: 48px; padding: 5px 7px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(5, 7, 13, 0.45); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; flex: none; }
  .bus:not(.colonne) { background: rgba(255, 255, 255, 0.06); min-height: 56px; }
  .bus.colonne { flex: 1 1 auto; max-height: 68px; }
  .bus.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.45), rgba(61, 224, 255, 0.3)); border-color: #8b7cff; }
  .bus.cv { border-style: dashed; border-color: rgba(255, 91, 222, 0.45); background: rgba(255, 91, 222, 0.08); }
  .bus.cv.on { background: linear-gradient(135deg, rgba(255, 91, 222, 0.4), rgba(139, 124, 255, 0.3)); border-style: solid; border-color: #ff5bde; }
  .lg { flex: none; width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; font: 800 10px 'Sora Variable', 'Sora', sans-serif; color: #06080f; }
  .lg.cv { border-radius: 50%; font-size: 11px; }
  .nm { font: 700 13px/1.2 'Sora Variable', 'Sora', sans-serif; }
  .sb { font-size: 11px; color: #b7c0db; }
  .rt { align-items: flex-end; flex: none; }
  .pr { font: 700 13px 'Geist Mono', monospace; }
  .bd2 { font: 600 10px 'Geist Mono', monospace; color: #a1accb; white-space: nowrap; }
  .bd2.ok { color: #7cf0a6; } .bd2.wa { color: #ffc24b; } .bd2.inf { color: #7fb8ff; } .bd2.cv { color: #ff9bea; } .bd2.er { color: #ff6b6b; }
</style>
