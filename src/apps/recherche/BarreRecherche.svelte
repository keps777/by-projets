<script lang="ts">
  import { untrack } from 'svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { aujourdhui } from '../../data/horloge.ts';
  import { aller } from '../../router.svelte.ts';
  import { memoriserRecherche } from './actions.ts';
  import Calendrier from './Calendrier.svelte';
  import ChampAeroport from './ChampAeroport.svelte';
  import { fmtJourAnnee } from './dates.ts';
  import { va } from './nav.ts';
  import Pictos from './Pictos.svelte';
  import { PARTOUT, SOURCES, VOYAGEURS_MAX, ordreErreurs, validerRecherche, versFormulaire, versUrl, type Recherche, type Source } from './params.ts';

  /** Barre de recherche PC (≥ 900 px) de l'accueil, des résultats et du marché : De · À · Départ · Voyageurs · Sources · Rechercher. Elle part de `init`, valide, mémorise la recherche puis ouvre les résultats.
   *  `nuit` : la barre reste claire (papier) sur la face nuit, avec une action sombre. Les sources se règlent dans le formulaire complet (lien « Sources »). */
  let { init, nuit = false, ou = 'bar' }: { init: Recherche; nuit?: boolean; /** Préfixe des identifiants (évite les doublons si deux barres coexistent). */ ou?: string } = $props();
  const aeroports = $derived(app.monde.aeroports), auj = $derived(aujourdhui());
  const i0 = untrack(() => init);
  let de = $state(i0.de), vers = $state(i0.vers), jour = $state(i0.jour ?? ''), n = $state(i0.n);
  let brutDe = $state(''), brutVers = $state(''), tente = $state(false), calendrier = $state(false);
  const sources: Source[] = i0.sources, flex = i0.flex, revendable = i0.revendable;
  const brouillon = $derived<Recherche>({ de, vers, jour: jour || undefined, flex: flex && !!jour, n, sources: SOURCES.filter((s) => sources.includes(s)), revendable });
  const libelleSources = $derived(brouillon.sources.length === SOURCES.length ? 'Neuf · Revente · Agences · Drops' : brouillon.sources.map((s) => ({ neuf: 'Neuf', revente: 'Revente', agence: 'Agences', drop: 'Drops' })[s]).join(' · '));
  function erreurs() {
    const e = validerRecherche(brouillon, aeroports, auj, false);
    if (!de && brutDe.trim()) e.de = 'Choisissez un aéroport dans la liste.';
    if (!vers && brutVers.trim()) e.vers = 'Choisissez un aéroport dans la liste.';
    return e;
  }
  const err = $derived(tente ? erreurs() : {});
  const messages = $derived(Object.values(err).filter(Boolean) as string[]);
  const joursAvecVol = $derived(app.monde.vols.filter((v) => v.de === de && (vers === PARTOUT || !vers || v.vers === vers)).map((v) => v.jour));
  function soumettre(e: Event) {
    e.preventDefault(); tente = true;
    const x = erreurs(), premier = ordreErreurs.find((k) => x[k]);
    if (premier) { const cible: Record<string, string> = { de: `${ou}-de`, vers: `${ou}-vers`, jour: `${ou}-jour`, n: `${ou}-n` }; queueMicrotask(() => document.getElementById(cible[premier])?.focus()); return; }
    memoriserRecherche(brouillon); aller(versUrl(brouillon));
  }
</script>

<div class="barre-wrap" data-face="jour" class:nuit>
  <form class="barre" role="search" aria-label="Rechercher un trajet" novalidate onsubmit={soumettre}>
    <div class="cellule"><ChampAeroport id="{ou}-de" label="De" bind:valeur={de} bind:brut={brutDe} {aeroports} exclure={vers === PARTOUT ? '' : vers} erreur={err.de} compact /></div>
    <div class="cellule"><ChampAeroport id="{ou}-vers" label="À" bind:valeur={vers} bind:brut={brutVers} {aeroports} partout exclure={de} erreur={err.vers} placeholder="Ville ou « Partout »" compact /></div>
    <div class="cellule">
      <span class="lib" id="{ou}-jour-l">Départ</span>
      <button type="button" id="{ou}-jour" class="valeur" class:vide={!jour} aria-haspopup="dialog" aria-labelledby="{ou}-jour-l {ou}-jour" aria-invalid={err.jour ? 'true' : undefined} onclick={() => (calendrier = true)}>{jour ? fmtJourAnnee(jour) : 'Toutes les dates'}</button>
    </div>
    <div class="cellule etroite">
      <label class="lib" for="{ou}-n">Voyageurs</label>
      <select id="{ou}-n" class="valeur" bind:value={n}>{#each Array.from({ length: VOYAGEURS_MAX }, (_, k) => k + 1) as k (k)}<option value={k}>{k} voyageur{k > 1 ? 's' : ''}</option>{/each}</select>
    </div>
    <a class="cellule sources" href={versFormulaire(brouillon)} onclick={(e) => va(e, versFormulaire(brouillon))} aria-label="Sources : {libelleSources}, modifier">
      <span class="col"><span class="lib">Sources</span><span class="valeur trunc">{libelleSources}</span></span><Pictos nom="suivant" taille={18} />
    </a>
    <button type="submit" class="go"><Pictos nom="chercher" taille={20} trait={2} />Rechercher</button>
  </form>
  {#if messages.length}<p class="alerte" role="alert"><Pictos nom="alerte" taille={18} />{messages[0]}{messages.length > 1 ? ` (+ ${messages.length - 1} autre${messages.length > 2 ? 's' : ''})` : ''}</p>{/if}
  <Feuille bind:ouvert={calendrier} titre="Date de départ" sous="Choisissez le jour du départ.">
    {#if calendrier}<Calendrier choisi={jour} min={auj} avecVols={joursAvecVol} aujourdhui={auj} onchoisir={(j) => { jour = j; calendrier = false; }} />{/if}
    {#snippet pied()}<button type="button" class="btn sec" onclick={() => { jour = ''; calendrier = false; }}>Toutes les dates</button>{/snippet}
  </Feuille>
</div>

<style>
  .barre-wrap { color: var(--ink); color-scheme: light; --soulignement: transparent; }
  .barre-wrap.nuit { --soulignement: #7a8597; }
  .barre { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border-radius: 20px; background: #fff; border: 1px solid var(--line); box-shadow: var(--ombre); }
  .nuit .barre { border-color: transparent; box-shadow: none; }
  .cellule { flex: 1 1 170px; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 4px 14px 6px; border-radius: 14px; background: #f1f2f4; border: 1px solid #7a8597; text-align: left; }
  .nuit .cellule { border-color: transparent; }
  .etroite { flex-basis: 140px; } .sources { flex: 1 1 210px; flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px; color: var(--ink); cursor: pointer; } .col { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .lib { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: #555c6b; }
  .valeur { width: 100%; min-width: 0; min-height: 44px; margin: 0; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #121418; font: 600 17px/24px 'Barlow', sans-serif; text-align: left; cursor: pointer; } .valeur.vide { color: #555c6b; font-weight: 500; }
  .sources .valeur { min-height: 28px; line-height: 28px; } .trunc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  select.valeur { appearance: auto; }
  .go { flex: 1 1 140px; display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 64px; padding: 0 22px; border: 0; border-radius: 14px; background: var(--signal); color: #0b1b2e; font: 700 16px/1 'Barlow', sans-serif; cursor: pointer; }
  .go:hover { background: var(--signal-2); } .nuit .go { background: #0d0e11; color: #fff; } .nuit .go:hover { background: #1d2027; }
  .barre :global(.options) { z-index: 40; }
  .alerte { display: flex; align-items: center; gap: 8px; margin: 8px 0 0; padding: 10px 14px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 600 14px/20px 'Barlow', sans-serif; }
  @media (prefers-reduced-motion: reduce) { .go { transition: none; } }
</style>
