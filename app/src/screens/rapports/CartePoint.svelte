<script lang="ts">
  // Carte d'un point du rapport (planches Rapport, RapportSemaine, RapportMois).
  import { formaterMesure, formaterMesures, type Langue } from '@core/rapport.ts';
  import { formatTemps } from '@core/units.ts';
  import { styleCouleur } from '../../ui/couleurs.ts';
  import Icone from '../../ui/Icone.svelte';
  import type { PointCalcule } from './calcul.ts';
  import { niveau } from './syntheses.ts';
  import type { Vue } from './periodes.ts';

  let { p, n, vue, langue, couleur, ratios = [], lettres = [], sousTitre = '', enCours = false, onmodifier }: {
    p: PointCalcule; n: number; vue: Vue; langue: Langue; couleur: string;
    /** Journée pas encore close : un zéro n'est pas un échec, on le montre sans rouge. */
    enCours?: boolean;
    /** Ratios jour par jour (semaine, mois) ; null = futur ou sans objectif. */
    ratios?: (number | null)[]; lettres?: string[]; sousTitre?: string;
    /** Toucher la carte (jour) : modifier les valeurs à la main. */
    onmodifier?: () => void;
  } = $props();

  const premiere = $derived(p.mesures[0]);
  const r = $derived(p.ratio);
  const etat = $derived(r == null ? 'neutre' : r >= 1 ? 'bon' : r > 0 ? 'partiel' : enCours ? 'neutre' : 'mauvais');

  const valeur = $derived.by(() => {
    if (!premiere) return '—';
    // Récapitulatif : valeur compacte, sans les références (le texte WhatsApp, lui, les garde).
    if (vue !== 'jour') return formaterMesures(p.mesures.filter((m) => m.type !== 'reference'), langue) || '—';
    if (premiere.type === 'temps' && premiere.attendu != null && premiere.fait != null) return formatTemps(premiere.fait, premiere.approx);
    return formaterMesure(premiere, langue);
  });
  const sous = $derived.by(() => {
    if (vue !== 'jour') return sousTitre;
    if (premiere?.type === 'temps' && premiere.attendu != null) return `objectif ${formatTemps(premiere.attendu)}`;
    return p.mesures[1] ? formaterMesure(p.mesures[1], langue) : '';
  });
  const points = $derived(premiere?.type === 'fois' && premiere.attendu != null && Number.isInteger(premiere.attendu) && premiere.attendu >= 1 && premiere.attendu <= 10 ? premiere.attendu : 0);
  const barre = $derived(!points && premiere?.attendu != null && premiere.attendu > 0 && r != null);
  const largeur = $derived(r == null ? 0 : r <= 0 ? (enCours ? 0 : 3) : Math.min(100, r * 100));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<article class="carte" class:cliquable={!!onmodifier} style={styleCouleur(couleur)} role={onmodifier ? 'button' : undefined} tabindex={onmodifier ? 0 : undefined}
  aria-label={onmodifier ? `${p.point.code} : modifier les valeurs` : undefined} onclick={onmodifier} onkeydown={(e) => { if (onmodifier && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onmodifier(); } }}>
  <div class="tete">
    <span class="n mono">{n}</span>
    <span class="noms">
      <span class="code">{p.point.code}</span>
      <span class="libelle muted">{p.point.libelle}</span>
    </span>
    <span class="droite">
      <span class="valeur mono {vue === 'jour' ? etat : ''}">{valeur}</span>
      {#if sous}<span class="sous muted">{sous}</span>{/if}
    </span>
  </div>

  {#if vue === 'jour'}
    <div class="jour">
    {#if points}
      <div class="pastilles" aria-label="{premiere.fait ?? 0} sur {points}">
        {#each { length: points } as _, i (i)}<span class:pleine={i < (premiere.fait ?? 0)}></span>{/each}
      </div>
    {:else if barre}
      <span class="piste"><span class="rempli {etat}" style:width="{largeur}%"></span></span>
    {/if}
    {#if p.mesures.length}
      <div class="puces">
        {#each p.mesures as m, i (i)}<span class="mono">{formaterMesure(m, langue)}</span>{/each}
      </div>
    {:else}
      <span class="muted vide">Aucune mesure : choisis-les dans les Réglages.</span>
    {/if}
    {#if onmodifier && p.mesures.length}<span class="modifier"><Icone nom="crayon" taille={13} />Toucher pour modifier les valeurs</span>{/if}
    </div>
  {:else if vue === 'semaine'}
    <div class="semaine">
      {#each ratios as x, i (i)}
        <div class="col">
          <span class="baton n{niveau(x)}" class:futur={x == null} style:height="{x == null ? 4 : Math.max(4, Math.round(Math.min(1.15, x) * 36))}px"></span>
          <span class="lettre">{lettres[i] ?? ''}</span>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Toujours deux rangées, comme la maquette (15 colonnes pour 30 jours, 16 pour 31). -->
    <div class="mois" style:grid-template-columns="repeat({Math.max(1, Math.ceil(ratios.length / 2))}, minmax(0, 1fr))">
      {#each ratios as x, i (i)}<span class="case n{niveau(x)}" class:futur={x == null}></span>{/each}
    </div>
  {/if}
</article>

<style>
  .cliquable { cursor: pointer; }
  .cliquable:active { transform: scale(0.985); }
  .modifier { display: inline-flex; align-items: center; gap: 5px; align-self: flex-start; font-size: 12px; font-weight: 600; color: var(--c-encre, var(--muted)); opacity: 0.85; }
  .carte { border-radius: 20px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .tete { display: flex; align-items: center; gap: 10px; }
  .n { flex: none; width: 26px; height: 26px; border-radius: 8px; background: var(--c-fond); color: var(--c-encre); font-size: 12px; display: flex; align-items: center; justify-content: center; }
  .noms { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .code { font-size: 15px; font-weight: 700; letter-spacing: 0.01em; }
  .libelle { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .droite { flex: none; max-width: 56%; text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
  .valeur { font-size: 15px; overflow-wrap: anywhere; }
  .valeur.bon { color: var(--bon); }
  .valeur.mauvais { color: var(--mauvais); }
  .sous { font-size: 11px; }
  .jour { display: flex; flex-direction: column; gap: 8px; }
  .pastilles { display: flex; align-items: center; gap: 6px; }
  .pastilles span { width: 22px; height: 22px; border-radius: 11px; border: 2px solid var(--c); transition: background 0.25s; }
  .pastilles span.pleine { background: var(--c); }
  .piste { position: relative; height: 8px; border-radius: 4px; background: var(--piste); }
  .rempli { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: var(--c); transition: width 0.4s ease; }
  .rempli.bon { background: var(--bon); }
  .rempli.mauvais { background: var(--mauvais); }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .puces span { font-size: 12px; padding: 5px 8px; border-radius: 8px; background: var(--surface-2); }
  .vide { font-size: 12px; }
  .semaine { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; align-items: end; height: 54px; }
  .col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 3px; height: 54px; }
  .baton { width: 100%; border-radius: 4px; background: var(--mauvais); }
  .baton.n1, .baton.n2 { background: var(--c); }
  .baton.n3 { background: var(--bon); }
  .baton.futur { background: var(--piste); }
  .lettre { font-size: 10px; color: var(--muted); }
  .mois { display: grid; grid-template-columns: repeat(15, minmax(0, 1fr)); gap: 3px; }
  .case { aspect-ratio: 1; border-radius: 3px; background: var(--surface-2); }
  .case.n1 { background: var(--c-fond); }
  .case.n2 { background: var(--c); }
  .case.n3 { background: var(--bon); }
  .case.futur { background: transparent; box-shadow: inset 0 0 0 1px var(--ligne); }
</style>
