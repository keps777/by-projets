<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { ajouterJours, decalerMois, fmtJourLong, fmtMoisLong, jourValide, semainesDuMois } from './dates.ts';
  import Pictos from './Pictos.svelte';

  /** Calendrier accessible (grille de dates au clavier) : flèches ±1 jour / ±1 semaine, Début/Fin, PageHaut/PageBas ±1 mois, Entrée ou Espace pour choisir.
   *  Les jours avant `min` sont grisés ; un point signale les jours où le trajet a des vols. */
  let { choisi = '', min, avecVols = [], aujourdhui, onchoisir }: { choisi?: string; min: string; avecVols?: string[]; aujourdhui: string; onchoisir: (jour: string) => void } = $props();
  const depart = untrack(() => (jourValide(choisi) && choisi >= min ? choisi : min));
  let cible = $state(depart);
  let affiche = $state({ annee: Number(depart.slice(0, 4)), mois: Number(depart.slice(5, 7)) });
  const semaines = $derived(semainesDuMois(affiche.annee, affiche.mois)), vols = $derived(new Set(avecVols));
  const ENTETES = [['Lun', 'lundi'], ['Mar', 'mardi'], ['Mer', 'mercredi'], ['Jeu', 'jeudi'], ['Ven', 'vendredi'], ['Sam', 'samedi'], ['Dim', 'dimanche']];
  const moisMin = $derived(affiche.annee * 12 + affiche.mois <= Number(min.slice(0, 4)) * 12 + Number(min.slice(5, 7)));

  function aller(jour: string) {
    if (jour < min) jour = min; cible = jour;
    affiche = { annee: Number(jour.slice(0, 4)), mois: Number(jour.slice(5, 7)) };
    void tick().then(() => document.getElementById(`cal-${jour}`)?.focus());
  }
  function decaler(delta: number) {
    const m = decalerMois(affiche.annee, affiche.mois, delta); affiche = m;
    const premier = `${m.annee}-${String(m.mois).padStart(2, '0')}-01`; cible = premier < min ? min : premier;
  }
  function touche(e: KeyboardEvent) {
    const pas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in pas) { e.preventDefault(); aller(ajouterJours(cible, pas[e.key])); return; }
    const dow = (new Date(`${cible}T12:00Z`).getUTCDay() + 6) % 7;
    if (e.key === 'Home') { e.preventDefault(); aller(ajouterJours(cible, -dow)); }
    else if (e.key === 'End') { e.preventDefault(); aller(ajouterJours(cible, 6 - dow)); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); const m = decalerMois(Number(cible.slice(0, 4)), Number(cible.slice(5, 7)), (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1)); const j = `${m.annee}-${String(m.mois).padStart(2, '0')}-${cible.slice(8)}`; aller(jourValide(j) ? j : ajouterJours(`${m.annee}-${String(m.mois).padStart(2, '0')}-01`, 27)); }
  }
</script>

<div class="cal">
  <div class="entete">
    <button type="button" class="nav" aria-label="Mois précédent" disabled={moisMin} onclick={() => decaler(-1)}><Pictos nom="retour" taille={20} trait={2} /></button>
    <p class="mois" aria-live="polite">{fmtMoisLong(affiche.annee, affiche.mois)}</p>
    <button type="button" class="nav" aria-label="Mois suivant" onclick={() => decaler(1)}><Pictos nom="suivant" taille={20} trait={2} /></button>
  </div>
  <div role="grid" tabindex="-1" aria-label={fmtMoisLong(affiche.annee, affiche.mois)} onkeydown={touche}>
    <div role="row" class="rang">{#each ENTETES as [c, l] (c)}<span role="columnheader" class="th"><abbr title={l} aria-label={l}>{c}</abbr></span>{/each}</div>
    {#each semaines as sem, i (i)}
      <div role="row" class="rang">
        {#each sem as j, k (k)}
          {#if j}
            {@const passe = j < min}
            <span role="gridcell" aria-selected={j === choisi} class="cel">
              <button type="button" id="cal-{j}" class="jour" class:choisi={j === choisi} class:auj={j === aujourdhui} class:vol={vols.has(j)} disabled={passe} tabindex={j === cible ? 0 : -1}
                aria-label="{fmtJourLong(j)}{vols.has(j) ? ', vols disponibles' : ''}{j === aujourdhui ? ', aujourd’hui' : ''}" aria-current={j === aujourdhui ? 'date' : undefined} onclick={() => onchoisir(j)} onfocus={() => (cible = j)}>
                {Number(j.slice(8))}{#if vols.has(j)}<span class="point" aria-hidden="true"></span>{/if}
              </button>
            </span>
          {:else}<span role="gridcell" class="cel"></span>{/if}
        {/each}
      </div>
    {/each}
  </div>
  <p class="legende"><span class="point" aria-hidden="true"></span>Jours avec des vols pour ce trajet</p>
</div>

<style>
  .cal { display: flex; flex-direction: column; gap: 8px; } .entete { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; }
  .mois { margin: 0; text-align: center; font: 600 20px/24px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .nav { width: 44px; height: 44px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface2); display: grid; place-items: center; cursor: pointer; color: var(--ink); } .nav:disabled { opacity: 0.4; cursor: not-allowed; }
  .rang { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); } .th { text-align: center; font: 700 12px/20px 'Barlow', sans-serif; letter-spacing: 0.06em; color: var(--ink2); text-transform: uppercase; } abbr { text-decoration: none; }
  .cel { display: grid; place-items: center; min-height: 44px; }
  .jour { position: relative; width: 100%; max-width: 44px; height: 44px; border-radius: 12px; border: 1px solid transparent; background: transparent; color: var(--ink); font: 600 15px/1 'Barlow', sans-serif; font-variant-numeric: tabular-nums; cursor: pointer; }
  .jour:hover:not(:disabled) { background: var(--accent-soft); } .jour:disabled { color: var(--ink3); opacity: 0.45; cursor: not-allowed; }
  .jour.auj { border-color: var(--line-strong); } .jour.choisi { background: var(--ink); color: #fff; border-color: var(--ink); }
  .point { position: absolute; left: 50%; bottom: 5px; width: 5px; height: 5px; margin-left: -2.5px; border-radius: 999px; background: var(--accent); } .jour.choisi .point { background: var(--signal); }
  .legende { margin: 4px 0 0; display: flex; align-items: center; gap: 8px; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); } .legende .point { position: static; margin: 0; }
</style>
