<script lang="ts">
  import type { Snippet } from 'svelte';
  /** Étiquette de bagage des planches m2-17 (droit à revendre : papier blanc) et m2-18 (demande : étiquette grise en pointillés). Décor : le sens est dans l'`aria-label`. */
  let { demande = false, titre, reference, iata, ville, trajet, ligne, pastilles, bas, aria }: { demande?: boolean; titre: string; reference: string; iata: string; ville: string; trajet: string; ligne: string; pastilles: Snippet; bas: string; aria: string } = $props();
  // Bande façon code-barres, déterministe (suite congruentielle), en pourcentages de la largeur.
  const barres = (() => { const l: { gauche: string; largeur: string }[] = []; let x = 0, g = 7; while (x < 100) { g = (g * 37 + 11) % 97; const w = 0.6 + (g % 4) * 0.5, e = 0.6 + ((g >> 2) % 3) * 0.6; l.push({ gauche: `${x.toFixed(2)}%`, largeur: `${w.toFixed(2)}%` }); x += w + e; } return l; })();
</script>
<div class="piste" class:demande><div class="support">
  <div class="ficelle" aria-hidden="true"><span></span></div>
  <div class="etiquette" role="img" aria-label={aria}>
    <span class="oeillet" aria-hidden="true"></span>
    <div class="tete"><span class="titre">{titre}</span><span class="mono ref">{reference}</span></div>
    <div class="dest"><span class="iata">{iata}</span><span class="qui"><span class="ville">{ville}</span><span class="mono trajet">{trajet}</span></span></div>
    <p class="mono ligne">{ligne}</p>
    <div class="pastilles">{@render pastilles()}</div>
    <div class="perfo" aria-hidden="true"></div>
    <div class="barres" aria-hidden="true">{#each barres as b, i (i)}<span style:left={b.gauche} style:width={b.largeur}></span>{/each}</div>
    <p class="mono bas" aria-hidden="true">{bas}</p>
  </div>
</div></div>
<style>
  .piste { margin-inline: -20px; padding: 6px 20px 2px; overflow-x: clip; }
  .support { position: relative; transform: rotate(-1.5deg); margin: 4px 0 0; }
  .ficelle { position: absolute; left: -24px; top: calc(50% - 5px); width: 58px; height: 10px; border-radius: 0 5px 5px 0; background: var(--line-strong); z-index: 2; display: flex; align-items: center; }
  .ficelle span { flex: 1; margin: 0 6px; border-top: 1px dashed var(--ink3); }
  .etiquette { position: relative; background: #fff; color: #121418; border-radius: 0 18px 18px 0; clip-path: polygon(30px 0, 100% 0, 100% 100%, 30px 100%, 0 calc(100% - 30px), 0 30px); padding: 14px 18px 14px 64px; }
  .oeillet { position: absolute; left: 18px; top: calc(50% - 15px); width: 30px; height: 30px; border-radius: 999px; background: #0D0E11; border: 5px solid #C9CDD5; }
  .tete { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .titre { font: 700 11px/16px 'Barlow', sans-serif; letter-spacing: .16em; text-transform: uppercase; color: #555C6B; } .ref { font-weight: 600; font-size: 12px; color: #555C6B; }
  .dest { display: flex; flex-wrap: wrap; align-items: flex-end; column-gap: 12px; margin-top: 4px; }
  .iata { font: 700 clamp(60px, min(26vw, 12.3dvh), 104px)/.87 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: -.01em; }
  .qui { display: flex; flex-direction: column; gap: 2px; padding-bottom: 6px; min-width: 0; } .ville { font: 600 13px/18px 'Barlow', sans-serif; color: #555C6B; } .trajet { font-weight: 600; font-size: 14px; }
  .ligne { margin: 6px 0 0; font-weight: 600; font-size: 18px; letter-spacing: .04em; }
  .pastilles { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .perfo { margin: 12px -18px 10px -64px; border-top: 2px dashed #E2E4E9; }
  .barres { position: relative; height: 34px; overflow: hidden; } .barres span { position: absolute; top: 0; bottom: 0; background: #121418; }
  .bas { margin: 4px 0 0; font-size: 11px; letter-spacing: .2em; color: #555C6B; }
  /* Variante « demande » : étiquette sombre, bord en pointillés, code-barres estompé. */
  .demande .etiquette { background: var(--surface); color: var(--ink); }
  .demande .oeillet { border-color: var(--line-strong); }
  .demande .titre { color: var(--ink2); } .demande .ref, .demande .bas { color: var(--ink3); } .demande .iata { color: var(--ink3); font-size: clamp(56px, min(24.6vw, 11.4dvh), 96px); } .demande .ville { color: var(--ink2); }
  .demande .perfo { border-top-color: var(--line-strong); } .demande .barres { opacity: .55; } .demande .barres span { background: var(--ink3); }
  .demande .etiquette::after { content: ''; position: absolute; inset: 0; border: 2px dashed var(--ink3); border-radius: 0 18px 18px 0; pointer-events: none; }
  /* Écran court (iPhone avec la barre de Safari) : le code-barres, purement décoratif, cède la place au contenu utile. */
  @media (max-height: 760px) { .perfo, .barres, .bas { display: none; } .etiquette { padding-bottom: 16px; } }
</style>
