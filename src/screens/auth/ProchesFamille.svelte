<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { CARTES_MAX } from '../../core/inscription.ts';
  import Alerte from './Alerte.svelte';
  import { ajouterProche, retirerProche } from './actions.ts';
  import { etatAuth, type Proche } from './etat.ts';

  /** Carte famille : proches qui recevront leur carte santé (Pass Famille et Premium, 6 cartes avec le titulaire). */
  let { onfini }: { onfini: () => void } = $props();
  const e = etatAuth();
  const LIENS: Proche['lien'][] = ['Conjoint', 'Enfant', 'Parent', 'Autre'];
  let nom = $state('');
  let lien = $state<Proche['lien']>('Conjoint');
  let erreur = $state('');
  const max = $derived((app.compte ? CARTES_MAX[app.compte.pass] : 1) - 1);
  function ajouter() { erreur = ajouterProche(nom, lien) ?? ''; if (!erreur) nom = ''; }
  function valider() {
    if (e.proches.length === 0) { montrer('Aucun proche choisi', 'danger'); return; }
    e.cartesDemandees = true; montrer('Cartes famille demandées'); onfini();
  }
</script>

<p class="muted">Choisissez qui reçoit sa carte santé dès demain. Jusqu'à {max} proche{max > 1 ? 's' : ''} avec votre Pass.</p>
{#if e.proches.length}
  <ul class="liste">
    {#each e.proches as p (p.id)}
      <li><span class="av">{p.nom.slice(0, 2).toUpperCase()}</span><span class="n"><b>{p.nom}</b><small>{p.lien}</small></span><button type="button" aria-label="Retirer {p.nom}" onclick={() => retirerProche(p.id)}><Icone nom="fermer" taille={16} trait={2.2} /></button></li>
    {/each}
  </ul>
{:else}<p class="vide">Aucun proche pour l'instant.</p>{/if}
{#if e.proches.length < max}
  <form onsubmit={(ev) => { ev.preventDefault(); ajouter(); }}>
    <label for="proche-nom">Prénom du proche</label>
    <div class="ligne"><input id="proche-nom" bind:value={nom} placeholder="Paul" autocomplete="off" maxlength="30" /><button type="submit" class="ajout" aria-label="Ajouter le proche"><Icone nom="plus" taille={20} trait={2.2} /></button></div>
    <div class="liens" role="radiogroup" aria-label="Lien">{#each LIENS as l (l)}<button type="button" role="radio" aria-checked={lien === l} class:on={lien === l} onclick={() => (lien = l)}>{l}</button>{/each}</div>
  </form>
{/if}
{#if erreur}<Alerte ton="erreur">{erreur}</Alerte>{/if}
<Bouton onclick={valider}>{e.cartesDemandees ? 'Mettre à jour la carte famille' : 'Ajouter à la carte famille'}</Bouton>

<style>
  .liste { list-style: none; display: flex; flex-direction: column; } li { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--ligne); }
  .av { width: 40px; height: 40px; border-radius: 20px; background: var(--primaire); color: #fff; display: grid; place-items: center; font: 600 12px var(--mono); flex: none; } .n { flex: 1; display: flex; flex-direction: column; } b { font-size: 14.5px; } small { color: var(--muted); font-size: 12px; }
  li button { width: 44px; height: 44px; display: grid; place-items: center; color: var(--muted); }
  .vide { color: var(--faint); font-size: 13px; }
  form { display: flex; flex-direction: column; gap: 8px; } label { font: 500 10.5px var(--mono); letter-spacing: 0.1em; color: var(--muted); text-transform: uppercase; }
  .ligne { display: flex; gap: 8px; } input { flex: 1; min-width: 0; min-height: 48px; padding: 0 14px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne-forte); font-size: 16px; outline: none; } input:focus { border-color: var(--primaire); }
  .ajout { width: 48px; height: 48px; border-radius: 14px; background: var(--primaire); color: #fff; display: grid; place-items: center; flex: none; }
  .liens { display: flex; gap: 6px; flex-wrap: wrap; } .liens button { min-height: 44px; padding: 0 14px; border-radius: 22px; background: var(--carte2); border: 1px solid var(--ligne); color: var(--muted); font-size: 13px; font-weight: 550; } .liens button.on { background: var(--primaire-fond); border-color: var(--primaire); color: var(--texte); }
</style>
