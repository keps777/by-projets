<script lang="ts">
  import Panneau from './Panneau.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fcfa, court, lireMontant } from '../../core/money.ts';
  import { chiffresTel, operateurDuNumero } from '../../core/auth.ts';
  import { MONTANTS_RECHARGE, SOURCES_RECHARGE, erreurRecharge, fraisRecharge, type SourceId } from '../../core/paiement.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { recharger } from './actions.ts';

  /** `initial` : montant proposé d'office (ex. ce qui manque pour payer une facture). */
  let { ouverte = $bindable(false), initial = 0 }: { ouverte?: boolean; initial?: number } = $props();
  let choix = $state<number | null>(25_000), libre = $state(''), source = $state<SourceId>('orange'), erreur = $state('');
  $effect(() => {
    if (!ouverte) return;
    erreur = ''; source = 'orange';
    if (initial > 0) { choix = null; libre = String(initial); } else { choix = 25_000; libre = ''; }
  });
  const montant = $derived(libre.trim() ? lireMontant(libre) : choix);
  const src = $derived(SOURCES_RECHARGE.find((s) => s.id === source)!);
  const frais = $derived(montant ? fraisRecharge(montant, src.frais) : 0);
  const tel = $derived(app.compte ? chiffresTel(app.compte.telephone) : '');
  const operateur = $derived(tel ? operateurDuNumero(tel) : null);
  const masque = $derived(tel.length >= 4 ? `···· ${tel.slice(-4, -2)} ${tel.slice(-2)}` : '');
  function sousTitre(id: SourceId): string {
    if (id === 'visa') return 'Carte bancaire · 1 % de frais';
    const mien = (id === 'orange' && operateur === 'Orange') || (id === 'mtn' && operateur === 'MTN');
    return mien && masque ? `${masque} · instantané` : 'Autre numéro · instantané';
  }
  function valider() {
    const r = recharger(montant, source);
    if (!r.ok) { erreur = r.erreur; return; }
    ouverte = false;
    montrer(`Rechargé · +${fcfa(montant!)}`);
  }
</script>

<Panneau bind:ouverte titre="Recharger mon solde" sous={frais ? `FRAIS ${fcfa(frais)}` : '0 FRAIS'}>
  <div class="montants" role="group" aria-label="Montant à recharger">
    {#each MONTANTS_RECHARGE as v (v)}
      <button type="button" class:on={!libre.trim() && choix === v} aria-pressed={!libre.trim() && choix === v} onclick={() => { choix = v; libre = ''; erreur = ''; }}>{court(v)}</button>
    {/each}
  </div>
  <Champ etiquette="Autre montant" inputmode="numeric" placeholder="Ex. 35 000" suffixe="FCFA" bind:valeur={libre} {erreur} oninput={() => (erreur = '')} />
  <div class="sources" role="radiogroup" aria-label="Source de la recharge">
    {#each SOURCES_RECHARGE as s (s.id)}
      <button type="button" role="radio" aria-checked={source === s.id} class="src" class:on={source === s.id} onclick={() => (source = s.id)}>
        <span class="chip" style:background={s.chip}>{s.ini}</span>
        <span class="t"><b>{s.nom}</b><small>{sousTitre(s.id)}</small></span>
        <span class="radio" aria-hidden="true"></span>
      </button>
    {/each}
  </div>
  {#if src.frais && montant && !erreurRecharge(montant)}<p class="muted note">Votre carte sera débitée de {fcfa(montant + frais)} FCFA (dont {fcfa(frais)} de frais). Votre solde augmente de {fcfa(montant)}.</p>{/if}
  <div class="pied">
    <Bouton variante="secondaire" onclick={() => (ouverte = false)}>Annuler</Bouton>
    <Bouton onclick={valider} desactive={!montant}>Recharger {montant ? fcfa(montant) : ''}</Bouton>
  </div>
</Panneau>

<style>
  .montants { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .montants button { min-height: 48px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne); color: var(--muted); font: 500 14px var(--mono); }
  .montants button.on { background: var(--primaire-fond); border-color: var(--primaire); color: var(--texte); }
  .sources { display: flex; flex-direction: column; gap: 8px; }
  .src { display: flex; align-items: center; gap: 12px; padding: 12px 14px; min-height: 60px; border-radius: 16px; background: var(--carte2); border: 1px solid var(--ligne); text-align: left; }
  .src.on { border-color: var(--primaire); background: color-mix(in srgb, var(--primaire) 12%, var(--carte2)); }
  .chip { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; color: #fff; font: 600 11px var(--mono); flex: none; }
  .t { flex: 1; display: flex; flex-direction: column; } b { font-weight: 600; font-size: 14.5px; } small { color: var(--muted); font-size: 12.5px; }
  .radio { width: 20px; height: 20px; border-radius: 10px; border: 2px solid var(--ligne-forte); flex: none; } .on .radio { border-color: var(--primaire); background: radial-gradient(var(--primaire) 45%, transparent 50%); }
  .note { font-size: 12.5px; } .pied { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
</style>
