<script lang="ts">
  import { aller, param } from '../../router.svelte.ts';
  import { personneCourante } from '../../domain/actions.ts';
  import { formaterDistance, libelleHoraires, positionCarte } from '../../core/relais.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { garantirRelais, relaisDuMonde } from './actions.ts';
  import { relaisDuBrouillon, trancheColis } from './etat.ts';
  import Pic from './Pic.svelte';

  garantirRelais();
  const voyageur = $derived(personneCourante()?.role !== 'relais' && personneCourante()?.role !== 'livreur');
  const liste = $derived(relaisDuMonde());
  let sel = $state(param('relais') ?? '');
  const courant = $derived(liste.find((r) => r.personne.id === sel) ?? liste[0]);
  const enCours = $derived(relaisDuBrouillon());
  const pos = (r: (typeof liste)[number]) => positionCarte(r.boutique.est, r.boutique.nord);

  function choisir() {
    if (!courant) return;
    trancheColis().brouillon.relaisId = courant.personne.id;
    montrer(`Relais ${courant.boutique.nom} choisi`); aller('/colis/envoi');
  }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
</script>

<Mobile titre="Points relais" sous="Douala · autour de la gare d’Akwa" retourVers={voyageur ? '/colis/suivi' : '/relais/app'} dock={voyageur ? dockVoyageur('voyager') : undefined}>
  {#snippet droite()}{#if voyageur}<a class="pl ac" href="/relais/devenir" onclick={(e) => lien(e, '/relais/devenir')}>devenir relais</a>{/if}{/snippet}

  {#if liste.length === 0}
    <div class="center">
      <span class="ill"><Pic nom="maison" taille={64} trait={1.5} /></span>
      <span class="ttl t18">Aucun point relais ouvert</span>
      <span class="t14 mut">Les relais de Douala reviennent bientôt. Tu peux aussi choisir la livraison moto.</span>
    </div>
  {:else}
    <div class="map" role="group" aria-label="Carte en relief des points relais">
      <div class="plane"></div>
      {#each liste as r (r.personne.id)}
        {@const p = pos(r)}
        <button type="button" class="pin" class:on={courant?.personne.id === r.personne.id} style="left: {p.x}%; top: {p.y}px" aria-label="{r.boutique.nom}, {formaterDistance(r.distance)}, {r.ouverture.libelle}" aria-pressed={courant?.personne.id === r.personne.id} onclick={() => (sel = r.personne.id)}><i></i><b>{r.boutique.nom}</b></button>
      {/each}
      <span class="pl" style="position: absolute; left: 16px; bottom: 12px"><span class="dot" style="color: #ff5bde"></span>gare Akwa</span>
    </div>

    <div class="col g8" role="listbox" aria-label="Liste des points relais">
      {#each liste as r (r.personne.id)}
        <button type="button" role="option" aria-selected={courant?.personne.id === r.personne.id} class="rl" class:on={courant?.personne.id === r.personne.id} onclick={() => (sel = r.personne.id)}>
          <span class="bub" class:aq={courant?.personne.id === r.personne.id}><Pic nom="maison" taille={18} /></span>
          <span class="col grow"><span class="t15 b7">{r.boutique.nom}{#if enCours === r.personne.id} <span class="t12 aq">· choisi pour ton colis</span>{/if}</span><span class="t12 mut">{r.boutique.type} · {r.boutique.adresse} · {libelleHoraires(r.boutique)}</span></span>
          <span class="col" style="align-items: flex-end"><span class="t13 b7">{formaterDistance(r.distance)}</span><span class="pl {r.ouverture.ton}">{r.ouverture.libelle}</span></span>
        </button>
      {/each}
    </div>

    {#if courant}
      <div class="sheet">
        <div class="row sp"><span class="col"><span class="lab">Relais choisi</span><span class="ttl t18">{courant.boutique.nom}</span><span class="t13 mut">{courant.boutique.type} · {courant.boutique.adresse} · {formaterDistance(courant.distance)}</span><span class="t13 mut">{libelleHoraires(courant.boutique)}</span></span>
          <span class="pl {courant.ouverture.ton}">{courant.ouverture.libelle}</span></div>
        {#if !courant.ouverture.ouvert && voyageur}<span class="t12 wac" role="status">Fermé en ce moment : le colis restera en rayon jusqu’à l’ouverture.</span>{/if}
        {#if voyageur}
          <div class="row g8"><button type="button" class="b p" onclick={choisir}>Choisir ce relais</button><a class="b s" href="/course" onclick={(e) => lien(e, '/course')}>Y aller en moto</a></div>
        {/if}
      </div>
    {/if}
  {/if}
</Mobile>

<style>
  .map { position: relative; height: 260px; margin: 0 -16px; overflow: hidden; perspective: 800px; perspective-origin: 50% 15%; flex: none; }
  .plane { position: absolute; left: -30%; right: -30%; top: 0; bottom: -60%; transform: rotateX(58deg); transform-origin: 50% 60%; background-image: linear-gradient(rgba(61, 224, 255, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(61, 224, 255, 0.16) 1px, transparent 1px); background-size: 40px 40px; background-color: rgba(10, 14, 28, 0.6); }
  .pin { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 4px; border: 0; background: transparent; color: #f2f4ff; cursor: pointer; padding: 0; min-width: 44px; min-height: 44px; transform: translate(-50%, -100%); }
  .pin i { width: 16px; height: 16px; border-radius: 50%; background: #3de0ff; box-shadow: 0 0 16px #3de0ff; border: 3px solid #05070d; transition: transform 0.2s; }
  .pin b { font: 600 11px 'Geist Mono', monospace; padding: 3px 8px; border-radius: 999px; background: rgba(5, 7, 13, 0.8); border: 1px solid rgba(255, 255, 255, 0.2); white-space: nowrap; }
  .pin.on { z-index: 2; } .pin.on i { background: #ff5bde; box-shadow: 0 0 22px #ff5bde; transform: scale(1.4); }
  .pin.on b { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; border-color: transparent; }
  .rl { flex: none; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; min-height: 60px; }
  .rl.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.22), rgba(61, 224, 255, 0.14)); border-color: rgba(139, 124, 255, 0.45); }
  .t15 { font-size: 15px; }
  button:focus-visible, a:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
</style>
