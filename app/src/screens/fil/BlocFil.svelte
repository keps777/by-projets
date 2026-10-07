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

  /** Un bloc de la journée : couleur de la rubrique, cercle ou coche, ▶ pour lancer, remplissage du minuteur. */
  let { b, pct, col = 0, cols = 1, aujourdhui, passe, onouvrir, onjouer, apercu = null, selectionne = false, souleve = false }: {
    b: BlocVue; pct: number | null; col?: number; cols?: number; aujourdhui: boolean; passe: boolean;
    onouvrir: () => void; onjouer: () => void;
    /** Horaire provisoire pendant un glisser (début et fin en minutes). */
    apercu?: { debut: number; fin: number } | null;
    /** Bloc choisi pour être déplacé : poignées de début et de fin. */
    selectionne?: boolean;
    souleve?: boolean;
  } = $props();

  const debutMin = $derived(apercu?.debut ?? b.debutMin);
  const finMin = $derived(apercu?.fin ?? b.finMin);
  const hauteur = $derived(Math.max((finMin - debutMin) * PX - 3, 22));
  const haut = $derived(hauteur >= 48);
  const tourne = $derived(b.enCours || b.enPause);
  const rempli = $derived(b.fait ? 100 : tourne ? remplissage(minuteurDe(b.occ), horloge.maintenant, (finMin - debutMin) * 60) * 100 : 0);
  const style = $derived(styleTeinte(b.couleur, theme.mode));
  const sous = $derived(`${b.projet?.nom ?? 'Sans projet'} · ${hm(debutMin)}–${hm(finMin)}${b.projet && pct != null ? ` · mois ${pct} %` : ''}`);
  const montrerJouer = $derived(aujourdhui && !b.fait && hauteur >= 28);
</script>

<div class="bloc" data-occ={b.occ.id} class:tourne class:estompe={passe && !b.fait && !tourne} class:haut class:selectionne class:souleve {style}
  style:top="{debutMin * PX + 1}px" style:height="{hauteur}px"
  style:left="calc(56px + (100% - 66px) * {col} / {cols})" style:width="calc((100% - 66px) / {cols} - {cols > 1 ? 2 : 0}px)">
  <span class="rempli" style:width="{rempli}%"></span>
  {#if tourne}<span class="bord" style:left="{rempli}%"></span>{/if}
  {#if pct != null}<span class="mois" style:width="{pct}%"></span>{/if}
  <button type="button" class="ouvrir" onclick={onouvrir} aria-label="{b.titre}, {hm(debutMin)} à {hm(finMin)}{b.fait ? ', fait' : ''}">
    <span class="cercle" class:fait={b.fait}>{#if b.fait}<Icone nom="coche" taille={11} trait={3.6} />{/if}</span>
    <span class="textes">
      <span class="titre-bloc" class:petit={hauteur < 30}>{b.titre}</span>
      {#if haut}<span class="sous">{sous}</span>{/if}
    </span>
  </button>
  {#if montrerJouer}
    <button type="button" class="jouer" onclick={onjouer} aria-label="{b.enCours ? 'Mettre en pause' : 'Lancer'} {b.titre}">
      <span class="pastille">
        {#if b.enCours}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" /><rect x="14" y="4" width="5" height="16" rx="1.5" /></svg>
        {:else}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
        {/if}
      </span>
    </button>
  {/if}
  {#if b.fait}<span class="reel mono">{etiquetteRealise(b)}</span>{/if}
  {#if selectionne}
    <span class="poignee haut-p" data-poignee="debut" aria-label="Changer l’heure de début de {b.titre}" role="slider" aria-valuenow={debutMin} aria-valuemin={0} aria-valuemax={1440} tabindex="-1"></span>
    <span class="poignee bas-p" data-poignee="fin" aria-label="Changer l’heure de fin de {b.titre}" role="slider" aria-valuenow={finMin} aria-valuemin={0} aria-valuemax={1440} tabindex="-1"></span>
  {/if}
</div>

<style>
  .bloc { position: absolute; border-radius: 10px; background: var(--c-fond); overflow: hidden; display: flex; align-items: stretch; color: var(--c-encre); }
  .bloc.estompe { opacity: 0.55; }
  .bloc { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
  .bloc.selectionne { z-index: 5; overflow: visible; box-shadow: 0 0 0 2px var(--c), 0 8px 22px var(--c-rempli); opacity: 1; }
  .bloc.souleve { transition: box-shadow 0.15s ease; box-shadow: 0 0 0 2px var(--c), 0 14px 30px rgba(0, 0, 0, 0.45); }
  .poignee { position: absolute; left: 50%; width: 44px; height: 24px; margin-left: -22px; touch-action: none; z-index: 6; display: flex; align-items: center; justify-content: center; }
  .poignee::after { content: ''; width: 22px; height: 6px; border-radius: 3px; background: var(--c); box-shadow: 0 0 0 2px var(--fond); }
  .haut-p { top: -13px; }
  .bas-p { bottom: -13px; }
  .bloc { transition: transform 0.14s ease, opacity 0.3s ease, box-shadow 0.3s ease; }
  .bloc:has(> .ouvrir:active) { transform: scale(0.985); }
  .bloc.tourne { box-shadow: 0 0 0 1.5px var(--c), 0 6px 18px var(--c-rempli); z-index: 2; }
  .rempli { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c-rempli); transition: width 0.9s linear; }
  .bord { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -2px; background: var(--c); transition: left 0.9s linear; }
  .mois { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--c); opacity: 0.85; }
  .ouvrir { position: relative; flex: 1; min-width: 0; border: 0; background: transparent; color: inherit; text-align: left; padding: 0 4px 0 10px; display: flex; gap: 8px; align-items: center; }
  .ouvrir:active, .jouer:active { transform: none; }
  .jouer:active .pastille { transform: scale(0.9); }
  .haut .ouvrir { padding: 9px 4px 9px 10px; align-items: flex-start; }
  .cercle { flex: none; width: 18px; height: 18px; border-radius: 9px; border: 2px solid var(--c); display: flex; align-items: center; justify-content: center; color: var(--c-sur); }
  .haut .cercle { margin-top: 1px; }
  .cercle.fait { background: var(--c); }
  .textes { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .titre-bloc { font-size: 14px; font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .titre-bloc.petit { font-size: 12px; }
  .bloc:has(.cercle.fait) .titre-bloc { opacity: 0.78; }
  .sous { font-size: 12px; line-height: 1.25; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .jouer { position: relative; flex: none; width: 44px; border: 0; background: transparent; display: flex; align-items: center; justify-content: center; color: var(--c-sur); }
  .pastille { width: 28px; height: 28px; border-radius: 14px; background: var(--c); display: flex; align-items: center; justify-content: center; transition: transform 0.12s ease; }
  .reel { position: relative; flex: none; align-self: center; padding: 0 10px 0 4px; font-size: 11px; opacity: 0.85; }
  .haut .reel { align-self: flex-start; padding: 11px 10px 0 4px; }
</style>
