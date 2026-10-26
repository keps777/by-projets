<script lang="ts">
  import { onDestroy } from 'svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { FRAIS_SERVICE } from '../../core/regles.ts';
  import { acheterDrop, ErreurDrop } from '../../domain/drop.ts';
  import { totalAPayer } from '../../domain/marche.ts';
  import type { Compte, Drop, Vol } from '../../domain/types.ts';
  import { reseau } from '../transferts/reseau.svelte.ts';
  import { jourSemaine } from '../voyager/format.ts';

  /** Réservation d'une place du drop : récapitulatif, moyen de paiement (carte enregistrée ou solde NexG), paiement simulé, puis la confirmation. Aucun paiement réel. */
  let { ouvert = $bindable(false), drop, vol, compte }: { ouvert?: boolean; drop: Drop; vol: Vol; compte: Compte } = $props();
  const total = $derived(totalAPayer(drop.prixMembre));
  const moyens = $derived([...(compte.carte4 ? [{ id: 'carte' as const, libelle: `Carte •••• ${compte.carte4}`, sous: 'Carte enregistrée (démo)' }] : []), ...(compte.solde >= total ? [{ id: 'solde' as const, libelle: 'Solde NexG', sous: `${fmt(compte.solde)} disponibles` }] : [])]);
  let choix = $state<'carte' | 'solde' | null>(null);
  const moyen = $derived(moyens.find((m) => m.id === choix)?.id ?? moyens[0]?.id);
  let erreur = $state(''), traitement = $state(false);
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(minuteur));
  $effect(() => { if (!ouvert) { erreur = ''; traitement = false; } });

  function payer() {
    if (traitement || !moyen) return; erreur = '';
    if (!reseau.enLigne) { erreur = 'Vous êtes hors ligne : la réservation exige une connexion. Rien n’a été débité.'; return; }
    traitement = true;
    minuteur = setTimeout(() => { // le « prestataire » répond (simulé)
      try { const d = acheterDrop(drop.id, compte.id, moyen); ouvert = false; aller(`/confirmation/${encodeURIComponent(d.id)}`, { remplacer: true }); }
      catch (e) { traitement = false; if (!(e instanceof ErreurDrop)) throw e; erreur = e.message; if (e.code === 'epuise' || e.code === 'termine') ouvert = false; }
    }, 700);
  }
</script>

<Feuille bind:ouvert titre="Réserver ce drop" sous={`${vol.de} → ${vol.vers} · ${jourSemaine(Date.parse(`${vol.jour}T${vol.heureDepart}`), { avecAnnee: true })}`}>
  <div class="demo" role="note"><Icone nom="info" taille={18} />MODE DÉMO — aucun paiement réel</div>
  <dl class="recap">
    <div><dt>Prix membre · drop N° {drop.n}</dt><dd>{fmt(drop.prixMembre)}</dd></div>
    <div><dt>Frais de service<span class="h">hypothèse</span></dt><dd>{fmt(FRAIS_SERVICE)}</dd></div>
    <div class="tot"><dt>Total</dt><dd>{fmt(total)}</dd></div>
  </dl>
  {#if moyens.length}
    <fieldset class="moyens"><legend class="t-sur">Moyen de paiement</legend>
      {#each moyens as m (m.id)}
        <label class="moyen" class:on={moyen === m.id}><input type="radio" name="moyen" value={m.id} checked={moyen === m.id} onchange={() => (choix = m.id)} /><span class="col g2"><span class="m1">{m.libelle}</span><span class="m2">{m.sous}</span></span></label>
      {/each}
    </fieldset>
  {:else}
    <p class="erreur" role="alert"><Icone nom="info" taille={16} /><span>Aucun moyen de paiement disponible : ajoutez une carte dans votre compte ou alimentez votre solde NexG.</span></p>
  {/if}
  <p class="regle">Une place par membre et par drop. La place est attribuée à la fin du paiement, dans l’ordre d’arrivée.</p>
  {#if erreur}<p class="erreur" role="alert"><Icone nom="alerte" taille={16} /><span>{erreur}</span></p>{/if}
  <p class="sr" aria-live="polite">{traitement ? 'Paiement en cours…' : ''}</p>
  {#snippet pied()}
    <button type="button" class="btn" onclick={payer} aria-disabled={!moyen || traitement} aria-busy={traitement}>{traitement ? 'Paiement en cours…' : `Payer ${fmt(total)} (démo)`}</button>
    <button type="button" class="btn sec" onclick={() => (ouvert = false)}>Annuler</button>
  {/snippet}
</Feuille>

<style>
  .demo { display: flex; align-items: center; gap: 8px; background: rgba(98, 199, 255, 0.12); border: 1px solid rgba(98, 199, 255, 0.4); color: var(--up); border-radius: 12px; padding: 10px 12px; font: 600 13px/18px 'Barlow', sans-serif; }
  .recap { margin: 0; display: flex; flex-direction: column; } .recap div { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; border-bottom: 1px solid var(--line); } dt, dd { margin: 0; }
  dt { font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); display: flex; flex-direction: column; } .h { font-size: 12px; color: var(--ink3); } dd { font: 600 15px/20px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .recap .tot { border-bottom: 0; } .tot dt { font: 700 16px/22px 'Barlow', sans-serif; color: var(--ink); } .tot dd { font-size: 22px; }
  .moyens { margin: 0; padding: 0; border: 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; } legend { padding: 0 0 8px; }
  .moyen { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 14px; border-radius: 14px; background: var(--surface2); border: 2px solid var(--line); cursor: pointer; } .moyen.on { border-color: var(--accent); background: var(--accent-soft); }
  .moyen:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; } .moyen input { width: 22px; height: 22px; margin: 0; accent-color: #ffd23f; flex: none; }
  .m1 { font: 700 15px/20px 'Barlow', sans-serif; } .m2 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .regle { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .erreur { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 600 13px/18px 'Barlow', sans-serif; } .erreur :global(svg) { margin-top: 1px; }
</style>
