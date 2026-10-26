<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import Console from './Console.svelte';
  import DropsVolet from './DropsVolet.svelte';
  import AgencesVolet from './AgencesVolet.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { etatForce, reseau } from './DropsReseau.svelte.ts';
  import { jourHeure } from './DropsFormat.ts';
  /** « Drops et agences » (`/admin/drops`) : deux volets, états chargement / erreur / hors ligne (`?etat=chargement|erreur|horsligne`). Les volets écrivent par `domain/admin-drops.ts`, chaque action est consignée. */
  const acteur = $derived(compteCourant()?.id ?? 'adm-01');
  let etat = $state<'ok' | 'chargement' | 'erreur'>(etatForce() === 'chargement' ? 'chargement' : etatForce() === 'erreur' ? 'erreur' : 'ok');
  const recu = maintenant();
  const horsLigne = $derived(!reseau.enLigne);
  let notice = $state<{ texte: string; ton: 'ok' | 'er' } | null>(null);
  function informer(texte: string, ton: 'ok' | 'er' = 'ok') { notice = { texte, ton }; }
  onMount(() => { document.title = 'Drops et agences · Administration · NexG-TT'; });
  const SQUELETTE = [0, 1, 2, 3];
</script>

<Console actif="drops" titre="Drops et agences" sous="Administration · drops et agences partenaires en démonstration · données fictives">
  {#if horsLigne}
    <div class="bandeau" role="status"><Icone nom="alerte" taille={20} trait={2} /><span>Hors ligne. Dernières données reçues le {jourHeure(recu)}. Lecture seule : la planification, l’ouverture, la vérification et la suspension sont indisponibles.</span></div>
  {/if}
  {#if notice}
    <div class="notice" class:er={notice.ton === 'er'} role={notice.ton === 'er' ? 'alert' : 'status'}><Icone nom={notice.ton === 'er' ? 'alerte' : 'ok'} taille={18} trait={2} /><span>{notice.texte}</span>
      {#if notice.ton === 'ok'}<a href="/admin/audit" class="voir" onclick={(e) => { e.preventDefault(); aller('/admin/audit'); }}>Voir le journal d’audit</a>{/if}<button type="button" class="x" aria-label="Fermer ce message" onclick={() => (notice = null)}><Icone nom="fermer" taille={16} /></button></div>
  {/if}

  {#if etat === 'erreur'}
    <div class="carte erreur" role="alert">
      <div class="row g8 titre"><Icone nom="alerte" taille={24} trait={2} /><h2>Impossible de charger les drops et les agences.</h2></div>
      <p class="t-sec">Le serveur n’a pas répondu. Aucune donnée n’a été modifiée.</p>
      <p class="t-aide">Code de corrélation : <span class="mono code">ERR-DEMO-91B0</span></p>
      <div><button type="button" class="btn sm" onclick={() => (etat = 'ok')}><Icone nom="echange" taille={18} />Réessayer</button></div>
    </div>
  {:else if etat === 'chargement'}
    <div class="col g12" aria-busy="true"><p class="t-sec" role="status">Chargement des drops et des agences…</p>
      <div class="squelette" aria-hidden="true">{#each SQUELETTE as i (i)}<div class="ligne">{#each [14, 22, 16, 12, 10, 12] as w, j (j)}<span style:width={`${w}%`}></span>{/each}</div>{/each}</div></div>
  {:else}
    <div class="deux">
      <DropsVolet {acteur} {horsLigne} {informer} />
      <AgencesVolet {acteur} {horsLigne} {informer} />
    </div>
  {/if}
</Console>

<style>
  .deux { display: flex; flex-direction: column; gap: 32px; min-width: 0; }
  .bandeau { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--signal-soft); color: var(--signal-ink); font: 600 14px/20px 'Barlow', sans-serif; }
  .bandeau :global(svg) { flex: none; margin-top: 1px; }
  .notice { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; border-radius: 14px; background: var(--ok-soft); color: var(--ok); font: 600 14px/20px 'Barlow', sans-serif; }
  .notice.er { background: var(--err-soft); color: var(--err); } .notice span { flex: 1 1 320px; }
  .voir { color: var(--ink); text-decoration: underline; font-weight: 700; display: inline-flex; align-items: center; min-height: 44px; }
  .x { width: 44px; height: 44px; border-radius: 999px; border: 0; background: transparent; color: inherit; display: grid; place-items: center; cursor: pointer; }
  .erreur { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 24px; } .titre { color: var(--err); } .titre h2 { font: 700 20px/26px 'Barlow', sans-serif; }
  .code { color: var(--ink); }
  .squelette { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
  .ligne { display: flex; gap: 16px; padding: 18px 16px; border-top: 1px solid var(--line); } .ligne:first-child { border-top: 0; }
  .ligne span { display: block; height: 14px; border-radius: 6px; background: var(--surface3); animation: nx-pulse 1.4s ease-in-out infinite; }
</style>
