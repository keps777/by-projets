<script lang="ts">
  import { NOMS_CRENEAUX, OPTIONS_CONFORT, PAS_PRIX, PRIX_MAX_FILTRE, PRIX_MIN_FILTRE, type Creneau } from '../../core/recherche.ts';
  import { app } from '../../data/store.svelte.ts';
  import Feuille from '../../ui/Feuille.svelte';
  import { initRecherche } from './etat.ts';
  import { basculer, compterDeparts, GENRES, libellePrix, libelleVoir, nbReglages, prixDuCurseur, toutEffacer, TRIS, valeurCurseur } from './filtres.ts';
  import { offresDuJour } from './offres.ts';

  /** Fenêtre de filtres et de tri de l'accueil : écrit dans la tranche `recherche`, l'accueil se met à jour derrière en direct. */
  let { ouvert = $bindable(false) }: { ouvert?: boolean } = $props();

  const R = initRecherche();
  const base = $derived(offresDuJour(R.jour, R.de, R.vers));
  /** Le vrai nombre de départs qui passent les réglages (type bus/covoit compris), en direct. */
  const n = $derived(compterDeparts(base, R));
  const plafond = $derived(valeurCurseur(R.prixMax));
  const pct = $derived((plafond - PRIX_MIN_FILTRE) / (PRIX_MAX_FILTRE - PRIX_MIN_FILTRE));
  const compagnies = $derived(app.monde.compagnies);
  const reglages = $derived(nbReglages(R));
</script>

<Feuille bind:ouvert titre="Filtres" sous="{R.de} → {R.vers} · {base.length} départ{base.length > 1 ? 's' : ''} ce jour-là" hauteur="haute">
  <section class="bloc" aria-labelledby="ff-tri">
    <span class="lab" id="ff-tri">Trier par</span>
    <div class="seg2" role="group" aria-labelledby="ff-tri">
      {#each TRIS as t (t.id)}<button type="button" class:on={R.tri === t.id} aria-pressed={R.tri === t.id} onclick={() => (R.tri = t.id)}>{t.nom}</button>{/each}
    </div>
  </section>

  <section class="bloc" aria-labelledby="ff-type">
    <span class="lab" id="ff-type">Type</span>
    <div class="seg2" role="group" aria-labelledby="ff-type">
      {#each GENRES as g (g.id)}<button type="button" class:on={R.genre === g.id} aria-pressed={R.genre === g.id} onclick={() => (R.genre = g.id)}>{g.nom}</button>{/each}
    </div>
  </section>

  <section class="bloc gl" aria-labelledby="ff-prix-l">
    <div class="row sp"><label class="lab" id="ff-prix-l" for="ff-prix">Prix max</label><span class="mono b7 aq" aria-live="polite">{libellePrix(R.prixMax)}</span></div>
    <div class="rng">
      <span class="tr"></span><span class="fl" style="left: 0; width: calc(14px + (100% - 28px) * {pct})"></span>
      <input id="ff-prix" class="nat" type="range" min={PRIX_MIN_FILTRE} max={PRIX_MAX_FILTRE} step={PAS_PRIX} value={plafond}
        aria-valuetext={R.prixMax === null ? 'Sans limite de prix' : libellePrix(R.prixMax)} oninput={(e) => (R.prixMax = prixDuCurseur(Number(e.currentTarget.value)))} />
    </div>
    <div class="row sp t12 mut3"><span>{PRIX_MIN_FILTRE.toLocaleString('fr-FR')} F</span><span>{PRIX_MAX_FILTRE.toLocaleString('fr-FR')} F +</span></div>
  </section>

  <section class="bloc" aria-labelledby="ff-heure">
    <span class="lab" id="ff-heure">Heure de départ</span>
    <div class="row g8 wrapf" role="group" aria-labelledby="ff-heure">
      {#each NOMS_CRENEAUX as c (c)}<button type="button" class="ch" class:on={R.creneaux.includes(c)} aria-pressed={R.creneaux.includes(c)} onclick={() => (R.creneaux = basculer<Creneau>(R.creneaux, c))}>{c}</button>{/each}
    </div>
  </section>

  <section class="bloc" aria-labelledby="ff-cie">
    <span class="lab" id="ff-cie">Compagnie</span>
    <div class="row g8 wrapf" role="group" aria-labelledby="ff-cie">
      {#each compagnies as c (c.id)}<button type="button" class="ch" class:on={R.compagnies.includes(c.id)} aria-pressed={R.compagnies.includes(c.id)} onclick={() => (R.compagnies = basculer(R.compagnies, c.id))}>{c.nom}</button>{/each}
    </div>
  </section>

  <section class="bloc" aria-labelledby="ff-conf">
    <span class="lab" id="ff-conf">Confort</span>
    <div class="gl col" style="gap: 0; padding: 4px 14px">
      {#each OPTIONS_CONFORT as o, i (o)}
        <div class="li"><span class="grow t14 b6" id="ff-opt-{i}">{o}</span><button type="button" class="sw" class:on={R.confort.includes(o)} role="switch" aria-checked={R.confort.includes(o)} aria-labelledby="ff-opt-{i}" onclick={() => (R.confort = basculer(R.confort, o))}></button></div>
      {/each}
    </div>
  </section>

  {#snippet pied()}
    <div class="row g8">
      <button type="button" class="b g eff" disabled={reglages === 0} onclick={() => toutEffacer(R)}>Effacer{reglages ? ` · ${reglages}` : ''}</button>
      <button type="button" class="b p grow" disabled={n === 0} aria-live="polite" onclick={() => (ouvert = false)}>{libelleVoir(n)}</button>
    </div>
  {/snippet}
</Feuille>

<style>
  .bloc { display: flex; flex-direction: column; gap: 8px; flex: none; }
  .bloc.gl { padding: 12px 14px; gap: 4px; }
  .seg2 button { font-size: 13px; padding: 0 4px; }
  .eff { flex: none; padding: 0 16px; white-space: nowrap; }
  .b:disabled { opacity: 0.45; cursor: not-allowed; }
  .nat { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; background: transparent; appearance: none; -webkit-appearance: none; cursor: pointer; touch-action: pan-y; }
  .nat::-webkit-slider-runnable-track { height: 44px; background: transparent; }
  .nat::-moz-range-track { height: 44px; background: transparent; }
  .nat::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 28px; height: 28px; margin-top: 8px; border-radius: 50%; background: #f2f4ff; border: 0; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5); }
  .nat::-moz-range-thumb { width: 28px; height: 28px; border-radius: 50%; background: #f2f4ff; border: 0; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5); }
  .nat:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; border-radius: 14px; }
</style>
