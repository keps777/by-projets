<script lang="ts">
  import Feuille from '../../ui/Feuille.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fcfa, lireMontant } from '../../core/money.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { apercuRetrait, retirer } from './actions.ts';
  import { trouverCoffre } from './etat.ts';

  /** Retrait vers le solde, en deux temps : montant puis confirmation (avertissement ou frais avant l'objectif). */
  let { ouverte = $bindable(false), coffreId }: { ouverte?: boolean; coffreId: string } = $props();
  const c = $derived(trouverCoffre(coffreId));
  let saisie = $state('');
  let etape = $state<1 | 2>(1);
  const montant = $derived(lireMontant(saisie));
  const r = $derived(apercuRetrait(coffreId, montant ?? 0));
  $effect(() => { if (ouverte) { saisie = ''; etape = 1; } });

  function confirmer() {
    if (!montant) return;
    const res = retirer(coffreId, montant);
    if (res.ok) { montrer(res.message); ouverte = false; } else { montrer(res.erreur, 'danger'); etape = 1; }
  }
</script>

<Feuille bind:ouverte titre={c ? `Retirer de ${c.nom}` : 'Retirer'} sous={etape === 1 ? 'Vers votre solde' : 'Confirmation'}>
  {#if c}
    {#if etape === 1}
      <p class="muted">Épargne du coffre : <b class="mono">{fcfa(c.epargne)}</b> FCFA{c.epargne >= c.objectif ? ' · objectif atteint, retrait libre' : ' · objectif non atteint'}</p>
      <Champ etiquette="Montant à retirer" placeholder="Ex. 50 000" inputmode="numeric" suffixe="FCFA" bind:valeur={saisie} erreur={saisie.trim() && !r.ok ? (r.erreur ?? '') : ''} />
      <Bouton variante="discret" plein={false} onclick={() => (saisie = String(c.epargne))}>Tout retirer ({fcfa(c.epargne)})</Bouton>
      {#if r.ok && r.avertissement}<div class="avert" role="note"><Icone nom="attention" taille={18} /><p>{r.avertissement}</p></div>{/if}
      <Bouton onclick={() => (etape = 2)} desactive={!r.ok || !montant}>Continuer</Bouton>
      <Bouton variante="discret" onclick={() => (ouverte = false)}>Annuler</Bouton>
    {:else}
      <div class="recap">
        <div><span class="muted">Retrait du coffre</span><b class="mono">{fcfa(montant ?? 0)}</b></div>
        {#if r.penalite}<div><span class="muted">Frais de retrait anticipé (2 %)</span><b class="mono danger">− {fcfa(r.penalite)}</b></div>{/if}
        <div class="net"><span>Crédité sur votre solde</span><b class="mono">{fcfa(r.net)} FCFA</b></div>
      </div>
      {#if r.avertissement}<div class="avert" role="note"><Icone nom="attention" taille={18} /><p>{r.avertissement}</p></div>{/if}
      {#if c.partage}<p class="muted petit">Coffre partagé : le retrait est notifié aux {c.membres - 1} autres membres.</p>{/if}
      <p class="muted petit">Après ce retrait, il restera {fcfa(c.epargne - (montant ?? 0))} dans le coffre{c.auto ? ' et le versement automatique continue' : ''}.</p>
      <Bouton variante={r.libre ? 'primaire' : 'danger'} onclick={confirmer}>Confirmer le retrait</Bouton>
      <Bouton variante="discret" onclick={() => (etape = 1)}>Modifier le montant</Bouton>
    {/if}
  {/if}
</Feuille>

<style>
  p b { color: var(--texte); font-weight: 600; }
  .avert { display: flex; gap: 10px; padding: 12px 14px; border-radius: 14px; background: rgba(255, 122, 47, 0.12); border: 1px solid rgba(255, 122, 47, 0.35); color: var(--alerte); font-size: 13.5px; align-items: flex-start; } .avert :global(svg) { flex: none; margin-top: 1px; }
  .recap { background: var(--carte2); border-radius: 14px; padding: 4px 14px; } .recap div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--ligne); font-size: 14px; } .recap div:last-child { border: 0; }
  .net b { font-size: 18px; } .danger { color: var(--danger); } .petit { font-size: 12.5px; }
</style>
