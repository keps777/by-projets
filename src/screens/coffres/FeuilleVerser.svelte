<script lang="ts">
  import Feuille from '../../ui/Feuille.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fcfa, lireMontant } from '../../core/money.ts';
  import { verifierVersement } from '../../core/coffres.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { versementExceptionnel } from './actions.ts';
  import { trouverCoffre } from './etat.ts';
  import Puces from './Puces.svelte';

  /** Feuille « Verser dans un coffre » : versement exceptionnel prélevé sur le solde. */
  let { ouverte = $bindable(false), coffreId }: { ouverte?: boolean; coffreId: string } = $props();
  const c = $derived(trouverCoffre(coffreId));
  let choix = $state<number | null>(10_000);
  let libre = $state('');
  let touche = $state(false);
  const montant = $derived(libre.trim() ? lireMontant(libre) : choix);
  const erreur = $derived(c ? verifierVersement(c, montant, app.solde) : 'Coffre introuvable.');
  const montants = [5_000, 10_000, 25_000, 50_000];
  $effect(() => { if (ouverte) { touche = false; libre = ''; choix = 10_000; } });

  function valider() {
    touche = true;
    if (erreur || montant === null || !c) return;
    const r = versementExceptionnel(c.id, montant);
    if (r.ok) { montrer(r.message); ouverte = false; } else montrer(r.erreur, 'danger');
  }
</script>

<Feuille bind:ouverte titre={c ? `Verser dans ${c.nom}` : 'Verser'} sous="Depuis votre solde">
  {#if c}
    <p class="muted solde">Solde disponible : <b class="mono">{fcfa(app.solde)}</b> FCFA</p>
    <Puces nom="Montant à verser" options={montants.map((v) => ({ valeur: v, label: `${v / 1000} k` }))} bind:valeur={choix} onchoix={() => (libre = '')} />
    <Champ etiquette="Autre montant" placeholder="Ex. 15 000" inputmode="numeric" suffixe="FCFA" bind:valeur={libre} erreur={touche && libre.trim() && erreur ? erreur : ''} />
    {#if !(touche && libre.trim()) && erreur && montant !== null}<p class="alerte" role="alert">{erreur}</p>{/if}
    <div class="total">
      <span class="muted">Nouveau total du coffre</span>
      <span class="mono"><b>{fcfa(c.epargne + (erreur ? 0 : (montant ?? 0)))}</b> / {fcfa(c.objectif)}</span>
    </div>
    <Bouton onclick={valider} desactive={!!erreur}>Verser {montant && montant > 0 ? fcfa(montant) : ''} FCFA</Bouton>
    <Bouton variante="discret" onclick={() => (ouverte = false)}>Annuler</Bouton>
  {/if}
</Feuille>

<style>
  .solde { font-size: 13.5px; } .solde b { color: var(--texte); font-weight: 600; }
  .total { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 14px; border-radius: 14px; background: var(--carte2); font-size: 13.5px; } .total b { font-size: 17px; font-weight: 600; }
  .alerte { color: var(--alerte); font-size: 13px; }
</style>
