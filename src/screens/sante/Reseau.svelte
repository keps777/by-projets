<script lang="ts">
  import Carte from '../../ui/Carte.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { libelleKm, projeter, trierParDistance, type Point } from '../../core/reseau.ts';
  import { LIEUX, POSITION_PAR_DEFAUT, TYPES_LIEU } from './reseau.ts';

  let position: Point = $state(POSITION_PAR_DEFAUT);
  let source = $state<'defaut' | 'gps'>('defaut'); let etat = $state<'repos' | 'attente' | 'refus' | 'absent'>('repos');
  let type = $state('tous'); let carte = $state(false); let ouvert = $state('');
  const tries = $derived(trierParDistance(LIEUX, position));
  const visibles = $derived(tries.filter((l) => type === 'tous' || l.type === type));
  const plan = $derived(projeter(visibles, position));

  /** Géolocalisation optionnelle : refusée ou indisponible, on garde la position par défaut (Bonamoussadi). */
  function localiser() {
    if (!('geolocation' in navigator)) { etat = 'absent'; return; }
    etat = 'attente';
    navigator.geolocation.getCurrentPosition(
      (p) => { position = { lat: p.coords.latitude, lng: p.coords.longitude }; source = 'gps'; etat = 'repos'; },
      () => { etat = 'refus'; }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 });
  }
  const itineraire = (l: Point) => `https://maps.apple.com/?daddr=${l.lat},${l.lng}`;
</script>

<div class="entete">
  <p class="statut" role="status">{#if etat === 'attente'}Recherche de votre position…{:else if etat === 'refus'}Localisation refusée : distances depuis Bonamoussadi.{:else if etat === 'absent'}Localisation indisponible : distances depuis Bonamoussadi.{:else if source === 'gps'}Distances depuis votre position.{:else}Distances depuis Bonamoussadi (position par défaut).{/if}</p>
  <button class="loc" onclick={localiser} disabled={etat === 'attente'}><Icone nom="scan" taille={16} />Me localiser</button>
</div>
<div class="barre">
  <div class="filtres" role="group" aria-label="Type de lieu">
    {#each TYPES_LIEU as t (t.id)}<button class:on={type === t.id} aria-pressed={type === t.id} onclick={() => (type = t.id)}>{t.libelle}</button>{/each}
  </div>
  <button class="vue" aria-pressed={carte} onclick={() => (carte = !carte)}>{carte ? 'Liste' : 'Plan'}</button>
</div>

{#if carte}
  <div class="plan" aria-label="Plan schématique du réseau autour de vous">
    <span class="moi" style:left="50%" style:top="50%" title="Vous"></span>
    {#each plan as p (p.id)}{@const l = visibles.find((x) => x.id === p.id)!}
      <button class="pin" class:on={ouvert === p.id} style:left="{p.x}%" style:top="{p.y}%" onclick={() => (ouvert = ouvert === p.id ? '' : p.id)} aria-label="{l.nom}, {libelleKm(l.km)}">{libelleKm(l.km)}</button>
    {/each}
    <small>Plan schématique, non à l'échelle</small>
  </div>
{/if}

{#if visibles.length === 0}
  <Carte><p class="muted">Aucun lieu de ce type dans le réseau.</p></Carte>
{:else}
  <Carte rayon={20}>
    <ul>
      {#each visibles as l (l.id)}
        <li>
          <button class="item" aria-expanded={ouvert === l.id} onclick={() => (ouvert = ouvert === l.id ? '' : l.id)}>
            <span class="km mono">{libelleKm(l.km)}</span><span class="nom"><b>{l.nom}</b><small>{l.sous}</small></span>
          </button>
          {#if ouvert === l.id}
            <div class="detail"><p>{l.detail}</p>
              <div class="act"><a href="tel:{l.telephone.replace(/\s/g, '')}">Appeler</a><a href={itineraire(l)} target="_blank" rel="noopener noreferrer">Itinéraire</a></div></div>
          {/if}
        </li>
      {/each}
    </ul>
  </Carte>
{/if}

<style>
  .entete { display: flex; align-items: center; justify-content: space-between; gap: 10px; } .statut { font-size: 12.5px; color: var(--muted); flex: 1; }
  .loc { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border-radius: 22px; background: var(--primaire-fond); color: var(--pale); font-weight: 600; font-size: 13.5px; } .loc:disabled { opacity: 0.5; }
  .barre { display: flex; gap: 8px; align-items: center; } .filtres { display: flex; gap: 6px; overflow-x: auto; flex: 1; scrollbar-width: none; }
  .filtres button, .vue { min-height: 44px; padding: 0 14px; border-radius: 22px; border: 1px solid var(--ligne-forte); white-space: nowrap; font-size: 13.5px; color: var(--doux); }
  .filtres button.on, .vue[aria-pressed='true'] { background: var(--texte); color: var(--fond); border-color: var(--texte); font-weight: 600; }
  .plan { position: relative; height: 240px; border-radius: 20px; border: 1px solid var(--ligne); background: radial-gradient(circle at 50% 50%, var(--carte2), var(--carte)); overflow: hidden; }
  .plan small { position: absolute; bottom: 6px; left: 12px; font-size: 10.5px; color: var(--faint); }
  .moi { position: absolute; width: 14px; height: 14px; margin: -7px; border-radius: 50%; background: var(--bon); box-shadow: 0 0 0 6px rgba(61, 213, 152, 0.25); }
  .pin { position: absolute; transform: translate(-50%, -50%); min-height: 32px; min-width: 44px; padding: 0 9px; border-radius: 16px; background: var(--carte2); border: 1px solid var(--ligne-forte); font: 500 11px var(--mono); }
  .pin.on { background: var(--primaire); border-color: var(--primaire-clair); color: #fff; }
  ul { list-style: none; } li { border-bottom: 1px solid var(--ligne); } li:last-child { border: 0; }
  .item { width: 100%; display: flex; align-items: center; gap: 12px; text-align: left; min-height: 56px; padding: 6px 0; } .km { width: 58px; flex: none; color: var(--bon); font-size: 13px; }
  .nom { display: flex; flex-direction: column; min-width: 0; } small { color: var(--muted); font-size: 12.5px; }
  .detail { padding: 0 0 12px 70px; font-size: 13.5px; color: var(--doux); } .act { display: flex; gap: 8px; margin-top: 10px; }
  .act a { min-height: 44px; display: inline-flex; align-items: center; padding: 0 18px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne-forte); font-weight: 600; font-size: 14px; }
</style>
