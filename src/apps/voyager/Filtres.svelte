<script lang="ts">
  import { aller, retour } from '../../router.svelte.ts';
  import { filtrer, NOMS_CRENEAUX, OPTIONS_CONFORT, PAS_PRIX, PRIX_MAX_FILTRE, PRIX_MIN_FILTRE, sansPlafond, type Creneau } from '../../core/recherche.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { app } from '../../data/store.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { effacerFiltres, initRecherche } from './etat.ts';
  import { offresDuJour } from './offres.ts';

  const R = initRecherche();
  const base = $derived(offresDuJour(R.jour, R.de, R.vers));
  /** Le compteur est le vrai nombre de départs qui passent les filtres (type bus/covoit compris). */
  const n = $derived(filtrer(base, R).length);
  const plafond = $derived(R.prixMax ?? PRIX_MAX_FILTRE);
  const pct = $derived((plafond - PRIX_MIN_FILTRE) / (PRIX_MAX_FILTRE - PRIX_MIN_FILTRE));
  const compagnies = $derived(app.monde.compagnies);
  const bascule = <T,>(liste: T[], v: T) => (liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);
  const go = (e: MouseEvent, href: string) => { e.preventDefault(); aller(href); };
  const fermer = (e: MouseEvent) => { e.preventDefault(); retour('/'); };
</script>

{#snippet entete()}
  <header class="hd">
    <a class="ib" href="/" aria-label="Fermer" onclick={fermer}><Icone nom="fermer" /></a>
    <span class="ttl t18">Filtres</span>
    <button class="b g sm" type="button" onclick={() => effacerFiltres(R)}>Effacer</button>
  </header>
{/snippet}

<Mobile enteteLibre={entete} dock={dockVoyageur('voyager')}>
  <div class="gl">
    <div class="row sp"><label class="lab" for="prix-max">Prix max</label><span class="mono b7 aq" aria-live="polite">{sansPlafond(plafond) ? 'Sans limite' : fmtF(plafond)}</span></div>
    <div class="rng">
      <span class="tr"></span><span class="fl" style="left: 0; width: calc(14px + (100% - 28px) * {pct})"></span>
      <input id="prix-max" class="nat" type="range" min={PRIX_MIN_FILTRE} max={PRIX_MAX_FILTRE} step={PAS_PRIX} value={plafond}
        aria-valuetext={sansPlafond(plafond) ? 'Sans limite de prix' : fmtF(plafond)} oninput={(e) => { const v = Number(e.currentTarget.value); R.prixMax = sansPlafond(v) ? null : v; }} />
    </div>
    <div class="row sp t12 mut3"><span>{fmtF(PRIX_MIN_FILTRE)}</span><span>{fmtF(PRIX_MAX_FILTRE)}</span></div>
  </div>
  <span class="lab">Heure de départ</span>
  <div class="row g8 wrapf" role="group" aria-label="Heure de départ">
    {#each NOMS_CRENEAUX as c (c)}<button type="button" class="ch" class:on={R.creneaux.includes(c)} aria-pressed={R.creneaux.includes(c)} onclick={() => (R.creneaux = bascule<Creneau>(R.creneaux, c))}>{c}</button>{/each}
  </div>
  <span class="lab">Compagnie</span>
  <div class="row g8 wrapf" role="group" aria-label="Compagnie">
    {#each compagnies as c (c.id)}<button type="button" class="ch" class:on={R.compagnies.includes(c.id)} aria-pressed={R.compagnies.includes(c.id)} onclick={() => (R.compagnies = bascule(R.compagnies, c.id))}>{c.nom}</button>{/each}
  </div>
  <span class="lab">Confort</span>
  <div class="gl col" style="gap: 0">
    {#each OPTIONS_CONFORT as o (o)}
      <div class="li"><span class="grow t14 b6" id="opt-{o}">{o}</span><button type="button" class="sw" class:on={R.confort.includes(o)} role="switch" aria-checked={R.confort.includes(o)} aria-labelledby="opt-{o}" onclick={() => (R.confort = bascule(R.confort, o))}></button></div>
    {/each}
  </div>
  <p class="t12 mut3">{R.de} → {R.vers} · {base.length} départ{base.length > 1 ? 's' : ''} ce jour-là{R.genre === 'tout' ? '' : R.genre === 'bus' ? ' (bus seulement)' : ' (covoiturages seulement)'}</p>
  <div class="col g8 bas">
    {#if n > 0}<a class="b p" href="/" onclick={(e) => go(e, '/')} aria-live="polite">Voir {n} départ{n > 1 ? 's' : ''}</a>
    {:else}<button type="button" class="b p" disabled aria-live="polite">Aucun départ · élargis les filtres</button>{/if}
  </div>
</Mobile>

<style>
  .bas { margin-top: auto; position: sticky; bottom: -14px; }
  .rng { position: relative; height: 44px; }
  .nat { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; background: transparent; appearance: none; -webkit-appearance: none; cursor: pointer; }
  .nat::-webkit-slider-runnable-track { height: 44px; background: transparent; }
  .nat::-moz-range-track { height: 44px; background: transparent; }
  .nat::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 28px; height: 28px; margin-top: 8px; border-radius: 50%; background: #f2f4ff; border: 0; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5); }
  .nat::-moz-range-thumb { width: 28px; height: 28px; border-radius: 50%; background: #f2f4ff; border: 0; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5); }
  .nat:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; border-radius: 14px; }
  .b:disabled { opacity: 0.45; cursor: not-allowed; }
  .ch { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: #b7c0db; font: 600 14px 'Sora Variable', 'Sora', sans-serif; cursor: pointer; }
  .ch.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.35), rgba(61, 224, 255, 0.25)); border-color: #8b7cff; color: #f2f4ff; }
</style>
