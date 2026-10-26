<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { compteCourant, courrielValide } from '../../domain/compte.ts';
  import { droitDe } from '../../domain/marche.ts';
  import { brouillonDe, ErreurTransfert, etatTransfert, inviterProche, jourHeure, trancheTransferts } from '../../domain/transfert.ts';
  import { tempsReel } from '../voyager/temps.svelte.ts';
  import { va } from '../voyager/lien.ts';
  import CarteDroit from './CarteDroit.svelte';
  import Etapes from './Etapes.svelte';
  import Introuvable from './Introuvable.svelte';
  import { reseau } from './reseau.svelte.ts';
  import { designation, resumeDroit } from './vues.ts';

  /** Proche sans compte : un droit ne peut être transféré qu'à un compte NexG-TT. On propose d'inviter le proche par courriel (simulé) ; rien n'est transféré, le droit reste détenu. */
  let { droitId = '' }: { droitId?: string } = $props();
  trancheTransferts();
  const temps = tempsReel(30_000);
  const compte = $derived(compteCourant());
  const droit = $derived(droitId ? droitDe(droitId) : undefined);
  const monDroit = $derived(!!droit && !!compte && droit.detenteurId === compte.id);
  const resume = $derived(droit ? resumeDroit(app.monde, droit) : undefined);
  const f = $derived(compte && monDroit ? etatTransfert(droitId, compte.id, temps.maintenant) : undefined);
  const b = $derived(droitId ? brouillonDe(droitId) : undefined);
  const nom = $derived(b?.sansCompte?.nom ?? 'Ce proche');
  const d = $derived(designation(nom));
  const id = $derived(encodeURIComponent(droitId));

  let courriel = $state(''), erreur = $state(''), envoye = $state(false), saisi = $state(false);
  $effect(() => { if (!saisi && b?.sansCompte?.courriel) { courriel = b.sansCompte.courriel; saisi = true; } });
  $effect(() => { if (!envoye && b?.sansCompte?.courriel && b.sansCompte.id && trancheTransferts().sansCompte.find((p) => p.id === b.sansCompte!.id)?.invite) envoye = true; });

  function envoyer(e: Event) {
    e.preventDefault(); if (envoye || !compte) return;
    if (!courrielValide(courriel)) { erreur = 'Saisissez une adresse courriel valide.'; document.getElementById('courriel')?.focus(); return; }
    if (!reseau.enLigne) { erreur = 'Vous êtes hors ligne : reconnectez-vous pour envoyer l’invitation.'; return; }
    try { inviterProche(courriel, { compteId: compte.id, procheId: b?.sansCompte?.id, nom: b?.sansCompte?.nom }); envoye = true; erreur = ''; }
    catch (x) { if (x instanceof ErreurTransfert) { erreur = x.message; document.getElementById('courriel')?.focus(); } else throw x; }
  }
</script>

{#if !droitId}
  <!-- ancien écran réinstancié brièvement au changement de route : rien à montrer -->
{:else if !compte || !droit || !monDroit || !resume || !f}
  <Introuvable />
{:else}
  <Ecran titre="Transférer" face="nuit" retour={`/transferer/${id}`}>
    <CarteDroit {resume} />
    <Etapes n={1} libelle="Choisir le proche" />
    <div class="col g12">
      <h1 class="grand">{d.sujet} n’a pas encore de compte</h1>
      <span class="puce"><Icone nom="moi" taille={14} trait={2} />Sans compte NexG-TT</span>
    </div>
    <div role="status" class="col g12">
      <div class="note">
        <Icone nom="info" taille={20} />
        <span class="col g6"><span class="n1">Un droit ne peut être transféré qu’à un compte NexG-TT.</span><span class="n2">Rien n’est transféré : ce droit reste à vous, au statut {resume.statut}.</span></span>
      </div>
      {#if envoye}
        <div class="note ok">
          <Icone nom="ok" taille={20} trait={2.25} />
          <span class="col g6"><span class="n1 vert">Invitation envoyée (démo, aucun courriel réel)</span><span class="n3">Revenez ici quand {d.complement} aura créé son compte : vous pourrez alors lui transférer ce droit.</span></span>
        </div>
      {/if}
    </div>

    {#if !envoye}
      <section class="col g8" aria-labelledby="inv-h">
        <h2 id="inv-h" class="sec-t">Inviter {d.complement}</h2>
        <form class="col g8" onsubmit={envoyer} novalidate id="form-invitation">
          <label for="courriel" class="etiq">Courriel de {d.complement}</label>
          <input id="courriel" type="email" bind:value={courriel} oninput={() => (erreur = '')} autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="prenom@exemple.com" aria-describedby={erreur ? 'courriel-aide courriel-erreur' : 'courriel-aide'} aria-invalid={erreur ? 'true' : undefined} class:err={!!erreur} />
          <p id="courriel-aide" class="aide">Nous lui envoyons une invitation à créer un compte. Elle ne mentionne ni ce droit ni ce vol.</p>
          {#if erreur}<p id="courriel-erreur" class="erreur" role="alert"><Icone nom="info" taille={16} /><span>{erreur}</span></p>{/if}
        </form>
      </section>
    {/if}

    <p class="ech"><Icone nom="horloge" taille={16} /><span>Échéance de finalisation : {jourHeure(f.echeance)}. Un proche doit aussi nommer le voyageur avant ce moment.</span></p>
    <p class="hyp"><span class="h">[H]</span><span><strong>Hypothèse.</strong> L’invitation reste à valider ; aucun droit n’est mis en attente d’un compte.</span></p>

    {#snippet pied()}
      {#if !envoye}
        <button type="submit" form="form-invitation" class="btn">Envoyer l’invitation</button>
      {:else}
        <a class="btn" href={`/droit/${id}`} onclick={(e) => va(e, `/droit/${id}`)}>Revenir au billet</a>
      {/if}
      <a class="btn texte autre" href={`/transferer/${id}`} onclick={(e) => { e.preventDefault(); aller(`/transferer/${id}`); }}>Choisir un autre proche</a>
    {/snippet}
  </Ecran>
{/if}

<style>
  .grand { font: 600 34px/36px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; text-transform: uppercase; text-wrap: balance; }
  .sec-t { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .puce { align-self: flex-start; }
  .note { display: flex; align-items: flex-start; gap: 10px; padding: 14px; border-radius: 14px; background: var(--surface2); border: 1px solid var(--line-strong); } .note > :global(svg) { margin-top: 1px; }
  .note.ok { background: var(--ok-soft); border-color: var(--ok); } .note.ok > :global(svg) { color: var(--ok); }
  .n1 { font: 700 15px/21px 'Barlow', sans-serif; } .n1.vert { color: var(--ok); } .n2 { font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .n3 { font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink); }
  .etiq { font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .aide { font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink3); }
  input { height: 52px; padding: 0 14px; border-radius: 12px; background: var(--surface2); border: 1px solid #6b7282; color: var(--ink); font-size: 16px; min-width: 0; } input.err { border-color: var(--err); }
  .erreur { display: flex; align-items: flex-start; gap: 8px; font: 600 13px/18px 'Barlow', sans-serif; color: var(--err); } .erreur :global(svg) { margin-top: 1px; }
  .ech { display: flex; align-items: flex-start; gap: 8px; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .ech :global(svg) { margin-top: 1px; }
  .hyp { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .hyp strong { color: var(--ink); }
  .h { flex: none; display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border-radius: 999px; background: var(--surface3); color: var(--ink); font: 600 12px/1 'IBM Plex Mono', ui-monospace, monospace; }
  .autre { align-self: center; }
</style>
