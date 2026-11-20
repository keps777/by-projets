<script lang="ts">
  import { remplissage } from '@core/minuteur.ts';
  import type { BlocVue } from '../../data/requetes.ts';
  import { horloge } from '../../data/temps.svelte.ts';
  import { minuteurDe } from '../../data/actions/blocs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import { PX, etiquetteRealise } from './vue-blocs.ts';
  import { styleTeinte } from './teintes.ts';
  import { hm } from './format.ts';

  /** Un bloc de la colonne « Fait » : ce qui a réellement été fait, à l'heure où cela s'est passé. Un bloc dont le minuteur tourne y grandit en direct. */
  let { b, debut, fin, col = 0, cols = 1, onouvrir }: { b: BlocVue; debut: number; fin: number; col?: number; cols?: number; onouvrir: () => void } = $props();

  const hauteur = $derived(Math.max((fin - debut) * PX - 3, 22));
  const haut = $derived(hauteur >= 48);
  const tourne = $derived(b.enCours || b.enPause);
  const rempli = $derived(tourne ? remplissage(minuteurDe(b.occ), horloge.maintenant, Math.max(60, (fin - debut) * 60)) * 100 : 100);
  const style = $derived(styleTeinte(b.couleur, theme.mode));
  const heures = $derived(`${hm(debut)}–${tourne ? 'en cours' : hm(fin)}`);
</script>

<div class="fait" class:tourne data-fait={b.occ.id} {style} style:top="{debut * PX + 1}px" style:height="{hauteur}px"
  style:left="calc(56px + var(--zw) + 6px + var(--zw) * {col} / {cols})" style:width="calc(var(--zw) / {cols} - {cols > 1 ? 2 : 0}px)">
  <span class="rempli" style:width="{rempli}%"></span>
  <button type="button" class="ouvrir" onclick={onouvrir} aria-label="Fait : {b.titre}, {heures}{tourne ? '' : ', ' + etiquetteRealise(b)}">
    <span class="cercle" class:coche={!tourne}>{#if !tourne}<Icone nom="coche" taille={11} trait={3.6} />{/if}</span>
    <span class="textes">
      <span class="titre-bloc" class:petit={hauteur < 30}>{b.titre}</span>
      {#if haut}<span class="sous mono">{heures}{tourne ? '' : ' · ' + etiquetteRealise(b)}</span>{/if}
    </span>
  </button>
</div>

<style>
  .fait { position: absolute; border-radius: 10px; background: var(--c-fond); overflow: hidden; display: flex; align-items: stretch; color: var(--c-encre); -webkit-user-select: none; user-select: none; }
  .fait.tourne { box-shadow: 0 0 0 1.5px var(--c), 0 6px 18px var(--c-rempli); z-index: 2; }
  .rempli { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c-rempli); transition: width 0.9s linear; }
  .ouvrir { position: relative; flex: 1; min-width: 0; border: 0; background: transparent; color: inherit; text-align: left; padding: 0 6px 0 8px; display: flex; gap: 6px; align-items: center; }
  .fait:has(.sous) .ouvrir { align-items: flex-start; padding-top: 8px; padding-bottom: 8px; }
  .cercle { flex: none; width: 16px; height: 16px; border-radius: 8px; border: 2px solid var(--c); display: flex; align-items: center; justify-content: center; color: var(--c-sur); }
  .cercle.coche { background: var(--c); }
  .textes { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .titre-bloc { font-size: 13px; font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.9; }
  .titre-bloc.petit { font-size: 12px; }
  .fait:has(.sous) .titre-bloc, .haut .titre-bloc { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .sous { font-size: 11px; line-height: 1.25; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
