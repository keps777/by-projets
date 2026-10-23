<script lang="ts">
  import Feuille from '../../ui/Feuille.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { masquerTel } from '../../core/auth.ts';
  import { CODE_SMS_DEMO } from '../../data/constantes.ts';
  import { NOM_COMPTE, TYPES_COMPTE, estMobile, formaterNumero, libelleCompte, telephoneSms, type TypeCompte } from '../../core/avance-loyer.ts';
  import { enregistrerCompte, envoyerSms, erreursCompte, verifierSms } from './actions.ts';
  import { logement } from './etat.ts';
  import Puces from './Puces.svelte';

  let { ouverte = $bindable(false) }: { ouverte?: boolean } = $props();
  const l = logement();
  const compte = $derived(l.dossier?.compte ?? null);

  let type = $state<TypeCompte>(l.dossier?.compte?.type ?? 'orange');
  let numero = $state(l.dossier?.compte?.numero ?? '');
  let telephone = $state(l.dossier?.compte?.telephone ?? '');
  let titulaire = $state(l.dossier?.compte?.titulaire ?? '');
  let modifier = $state(false);
  let essaye = $state(false);
  let code = $state('');
  let messageCode = $state('');
  let occupe = $state(false);

  $effect(() => { const f = formaterNumero(type, numero); if (f !== numero) numero = f; });
  $effect(() => { const f = telephone.replace(/\D/g, '').slice(0, 9); if (f !== telephone) telephone = f; });
  const erreurs = $derived(erreursCompte({ type, numero, telephone, titulaire }));
  const etape = $derived<'saisie' | 'code' | 'ok'>(modifier || !compte ? 'saisie' : compte.verifie ? 'ok' : compte.otp ? 'code' : 'saisie');
  const libelleNumero = $derived(estMobile(type) ? 'NUMÉRO DU TÉLÉPHONE' : 'NUMÉRO DE COMPTE (RIB)');

  async function enregistrer() {
    essaye = true;
    if (Object.keys(erreurs).length) return;
    occupe = true;
    if (enregistrerCompte({ type, numero, telephone, titulaire })) { await envoyerSms(); modifier = false; code = ''; messageCode = ''; }
    occupe = false;
  }
  async function verifier() {
    occupe = true;
    const r = await verifierSms(code);
    occupe = false;
    if (r === 'ok') { montrer('Compte du bailleur vérifié'); ouverte = false; return; }
    messageCode = r === 'faux' ? 'Code incorrect. Redemandez-le au bailleur.' : r === 'expire' ? 'Ce code a expiré : renvoyez le SMS.' : "Trop d'essais : renvoyez le SMS.";
  }
  async function renvoyer() { occupe = true; await envoyerSms(); occupe = false; code = ''; messageCode = 'Nouveau SMS envoyé.'; }
</script>

<Feuille bind:ouverte titre="Compte du bailleur" sous={etape === 'ok' ? 'Vérifié' : ''}>
  {#if etape === 'saisie'}
    <p class="muted">Le bailleur reçoit l'avance et chaque loyer sur ce compte. Un SMS lui est envoyé pour confirmer que le compte est bien le sien.</p>
    <Puces etiquette="Type de compte" valeur={type} options={TYPES_COMPTE.map((t) => ({ valeur: t, libelle: NOM_COMPTE[t] }))} onchoisir={(t) => (type = t)} />
    <Champ etiquette={libelleNumero} bind:valeur={numero} placeholder={estMobile(type) ? '6 90 12 34 56' : 'CM21 0000 0000 0000'} inputmode={estMobile(type) ? 'tel' : 'text'} erreur={essaye ? (erreurs.numero ?? '') : ''} />
    {#if !estMobile(type)}<Champ etiquette="TÉLÉPHONE DU BAILLEUR (POUR LE SMS)" bind:valeur={telephone} placeholder="6 90 12 34 56" inputmode="tel" erreur={essaye ? (erreurs.telephone ?? '') : ''} />{/if}
    <Champ etiquette="TITULAIRE" bind:valeur={titulaire} placeholder="ESSOMBA Jean-Pierre" erreur={essaye ? (erreurs.titulaire ?? '') : ''} />
    {#if essaye && Object.keys(erreurs).length}<p class="err" role="alert">Entrez un numéro valide.</p>{/if}
    <Bouton desactive={occupe} onclick={enregistrer}>Enregistrer et envoyer le SMS</Bouton>
  {:else if etape === 'code' && compte}
    <p class="muted">Un SMS avec un code à 6 chiffres a été envoyé au bailleur au {masquerTel(telephoneSms(compte.type, compte.numero, compte.telephone))}. Demandez-lui le code et saisissez-le.</p>
    <Champ etiquette="CODE REÇU PAR LE BAILLEUR" bind:valeur={code} inputmode="numeric" placeholder="6 chiffres" erreur={messageCode && messageCode !== 'Nouveau SMS envoyé.' ? messageCode : ''} />
    {#if messageCode === 'Nouveau SMS envoyé.'}<p class="muted" role="status">{messageCode}</p>{/if}
    <p class="demo mono">SIMULATION · aucun vrai SMS : le code est {CODE_SMS_DEMO}</p>
    <Bouton desactive={occupe || code.replace(/\D/g, '').length !== 6} onclick={verifier}>Vérifier le compte</Bouton>
    <div class="deux"><Bouton variante="discret" plein={false} onclick={renvoyer}>Renvoyer le SMS</Bouton><Bouton variante="discret" plein={false} onclick={() => (modifier = true)}>Modifier le compte</Bouton></div>
  {:else if compte}
    <div class="ok"><Pastille ton="bon">Compte vérifié par SMS</Pastille><b>{libelleCompte(compte.type, compte.numero)}</b><span class="muted">Titulaire : {compte.titulaire}</span></div>
    <Bouton variante="secondaire" onclick={() => { type = compte.type; numero = compte.numero; telephone = compte.telephone; titulaire = compte.titulaire; modifier = true; }}>Modifier le compte</Bouton>
    <Bouton variante="discret" onclick={() => (ouverte = false)}>Fermer</Bouton>
  {/if}
</Feuille>

<style>
  .err { color: var(--danger); font-size: 13px; } .demo { font-size: 11px; letter-spacing: 0.06em; color: var(--alerte); }
  .deux { display: flex; justify-content: space-between; } .ok { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; padding: 14px; border-radius: 16px; background: var(--carte2); border: 1px solid rgba(61, 213, 152, 0.35); } .ok b { font-size: 17px; }
</style>
