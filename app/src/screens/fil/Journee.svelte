<script lang="ts">
  import { untrack } from 'svelte';
  import type { BlocVue } from '../../data/requetes.ts';
  import { maintenantLocal } from '../../data/temps.svelte.ts';
  import BlocFil from './BlocFil.svelte';
  import { disposer } from './disposition.ts';
  import { PX, pctDuBloc } from './vue-blocs.ts';
  import { hm } from './format.ts';
  import { heureProposee } from './tache.ts';
  import Icone from '../../ui/Icone.svelte';
  import { routeur } from '../../routeur.svelte.ts';

  /** Journée de 24 h : heures, blocs placés à leur heure (côte à côte s'ils se chevauchent), ligne « maintenant » en direct. */
  let { blocs, jour, aujourdhui, estAujourdhui, focusMin, onouvrir, onjouer }: {
    blocs: BlocVue[]; jour: string; aujourdhui: string; estAujourdhui: boolean; focusMin: number;
    onouvrir: (id: string) => void; onjouer: (id: string) => void;
  } = $props();

  const maintenant = $derived(maintenantLocal().minutes);
  const places = $derived(disposer(blocs.map((b) => ({ debut: b.debutMin, fin: b.finMin }))));
  const mois = $derived(aujourdhui.slice(0, 7));
  const pcts = $derived(blocs.map((b) => pctDuBloc(b, mois, aujourdhui)));
  const heures = Array.from({ length: 25 }, (_, h) => h);

  // Journée vide (aujourd'hui ou à venir) : un bloc fantôme en pointillés invite à poser le premier bloc juste après « maintenant ».
  const DUREE_FANTOME = 45;
  const fantome = $derived(!blocs.length && jour >= aujourdhui ? heureProposee(jour, aujourdhui, maintenant, DUREE_FANTOME) : null);

  // Toucher un espace libre de la journée : la même fenêtre que « + », à l'heure touchée (arrondie à la demi-heure inférieure).
  let grille: HTMLDivElement | undefined = $state();
  let apercu = $state<number | null>(null);
  const DUREE_APERCU = 30;
  function toucher(e: MouseEvent) {
    if (apercu != null || !grille || (e.target as Element).closest('.bloc, a, button')) return;
    const y = e.clientY - grille.getBoundingClientRect().top;
    const min = Math.max(0, Math.min(23 * 60 + 30, Math.floor(y / PX / 30) * 30));
    apercu = min;
    setTimeout(() => {
      routeur.aller(`/tache/nouvelle?heure=${min}${estAujourdhui ? '' : `&jour=${jour}`}`);
      apercu = null;
    }, 110);
  }

  let defile: HTMLDivElement | undefined = $state();
  // Ouvre la journée sur « maintenant » (ou sur le bloc en cours), à chaque changement de jour : la ligne se place
  // au tiers haut de la zone visible, comme sur la maquette (152 px sous le haut d’une zone de 430 px). Si la zone n'a pas encore
  // de hauteur (écran pas encore affiché), on réessaie à l'image suivante.
  $effect(() => {
    void jour;
    const el = defile;
    const cible = untrack(() => focusMin);
    if (!el) return;
    let essais = 0, image = 0;
    const placer = () => {
      if (!el.clientHeight && essais++ < 30) { image = requestAnimationFrame(placer); return; }
      el.scrollTop = Math.max(0, cible * PX + 12 - Math.round(el.clientHeight * 0.3535));
    };
    placer();
    return () => cancelAnimationFrame(image);
  });

  // Une PWA reprend là où on l'a laissée : au retour dans l'app, si la ligne « maintenant » est sortie de la vue, on y revient en douceur.
  $effect(() => {
    if (!estAujourdhui) return;
    const revenir = () => {
      const el = defile;
      if (!el || document.visibilityState !== 'visible') return;
      const y = untrack(() => maintenant) * PX + 12;
      if (y < el.scrollTop + 24 || y > el.scrollTop + el.clientHeight - 24)
        el.scrollTo({ top: Math.max(0, y - Math.round(el.clientHeight * 0.3535)), behavior: 'smooth' });
    };
    document.addEventListener('visibilitychange', revenir);
    // La zone se réduit quand la carte du bas grandit (plusieurs minuteurs) : « maintenant » doit rester visible.
    const obs = typeof ResizeObserver !== 'undefined' && defile ? new ResizeObserver(() => revenir()) : null;
    if (obs && defile) obs.observe(defile);
    return () => { document.removeEventListener('visibilitychange', revenir); obs?.disconnect(); };
  });
</script>

<div class="defile-jour" bind:this={defile}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="grille" bind:this={grille} onclick={toucher} style:height="{24 * 60 * PX}px">
    {#each heures as h (h)}
      <div class="heure" style:top="{h * 60 * PX - 7}px" style:opacity={estAujourdhui && Math.abs(h * 60 - maintenant) < 13 ? 0 : 1}>
        <span class="mono">{hm(h * 60)}</span><span class="trait"></span>
      </div>
    {/each}

    {#each blocs as b, i (b.occ.id)}
      <BlocFil {b} pct={pcts[i]} col={places[i]?.col ?? 0} cols={places[i]?.cols ?? 1} aujourdhui={estAujourdhui}
        passe={estAujourdhui ? b.finMin <= maintenant : jour < aujourdhui} onouvrir={() => onouvrir(b.occ.id)} onjouer={() => onjouer(b.occ.id)} />
    {/each}

    {#if apercu != null}
      <div class="apercu" style:top="{apercu * PX + 1}px" style:height="{DUREE_APERCU * PX - 3}px" aria-hidden="true">
        <span class="plus-fantome"><Icone nom="plus" taille={12} trait={2.6} /></span><span class="titre-fantome">{hm(apercu)}</span>
      </div>
    {/if}

    {#if fantome != null}
      <a class="fantome" href="/tache/nouvelle?heure={fantome}{estAujourdhui ? '' : `&jour=${jour}`}" style:top="{fantome * PX + 1}px" style:height="{DUREE_FANTOME * PX - 3}px"
        aria-label="Ajouter un bloc à {hm(fantome)}">
        <span class="plus-fantome"><Icone nom="plus" taille={12} trait={2.6} /></span>
        <span class="textes-fantome">
          <span class="titre-fantome">{estAujourdhui ? 'Ton premier bloc ?' : 'Un premier bloc ?'}</span>
          <span class="sous-fantome">{hm(fantome)}–{hm(fantome + DUREE_FANTOME)} · touche pour le placer ici</span>
        </span>
      </a>
    {/if}

    {#if estAujourdhui}
      <div class="maintenant" style:top="{maintenant * PX}px" aria-label="Maintenant, {hm(maintenant)}">
        <span class="cote"><span class="pastille mono">{hm(maintenant)}</span></span>
        <span class="point"></span>
        <span class="ligne"></span>
      </div>
    {/if}
  </div>
</div>

<style>
  .defile-jour { flex: 1; min-height: 0; overflow-y: auto; position: relative; }
  .grille { position: relative; margin: 12px 0 28px; }
  .heure { position: absolute; left: 0; right: 0; display: flex; align-items: center; gap: 6px; pointer-events: none; }
  .heure .mono { width: 46px; text-align: right; font-size: 11px; color: var(--faint); }
  .heure .trait { flex: 1; height: 1px; background: var(--ligne); }
  .maintenant { position: absolute; left: 0; right: 0; height: 0; display: flex; align-items: center; z-index: 4; pointer-events: none; }
  .cote { width: 52px; display: flex; justify-content: flex-end; padding-right: 2px; }
  .pastille { background: var(--maintenant-pastille); color: var(--carte-texte); font-size: 11px; padding: 3px 6px; border-radius: 9px; letter-spacing: -0.02em; }
  .point { width: 10px; height: 10px; border-radius: 5px; background: var(--maintenant); margin-left: 1px; box-shadow: 0 0 0 3px var(--halo); flex: none; }
  .ligne { flex: 1; height: 2px; background: var(--maintenant); }
  .fantome { position: absolute; left: 56px; right: 10px; border-radius: 10px; border: 1.5px dashed color-mix(in srgb, var(--muted) 55%, transparent);
    display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; color: var(--texte); background: var(--fond); animation: fantome-entre 0.5s ease both; }
  .apercu { position: absolute; left: 56px; right: 10px; border-radius: 10px; border: 1.5px dashed var(--accent); background: var(--accent-fond); color: var(--accent-encre);
    display: flex; align-items: center; gap: 8px; padding: 0 10px; animation: fantome-entre 0.11s ease both; z-index: 3; pointer-events: none; }
  .fantome:active { transform: scale(0.985); background: var(--surface); }
  .plus-fantome { flex: none; width: 18px; height: 18px; margin-top: 1px; border-radius: 9px; background: var(--inverse); color: var(--inverse-texte);
    display: flex; align-items: center; justify-content: center; animation: fantome-pouls 2.4s ease-in-out 0.6s infinite; }
  .textes-fantome { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .titre-fantome { font-size: 14px; font-weight: 600; line-height: 1.2; }
  .sous-fantome { font-size: 12px; line-height: 1.25; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @keyframes fantome-entre { from { opacity: 0; transform: translateY(6px); } }
  @keyframes fantome-pouls { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--inverse) 30%, transparent); } 50% { box-shadow: 0 0 0 5px transparent; } }
</style>
