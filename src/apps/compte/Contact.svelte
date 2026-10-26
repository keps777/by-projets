<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import './compte.css';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pic from './Pic.svelte';
  import { etatForce, reseau } from './reseau.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { MESSAGE_MAX, SUJETS, envoyerMessage, etat, majBrouillon, validerMessage, type Demande, type Sujet } from './aide.ts';

  /** Contacter l'assistance (simulé : aucun message n'est réellement envoyé). Brouillon conservé sur l'appareil ; états : saisie invalide, envoi, envoyé, échec, hors ligne. */
  const compte = $derived(compteCourant());
  let sujet = $state<Sujet | null>(null), reference = $state(''), message = $state('');
  let vue = $state<'saisie' | 'envoi' | 'envoye' | 'echec'>('saisie'), tente = $state(false), demande = $state<Demande | null>(null);
  let echecForce = false, minuterie: ReturnType<typeof setTimeout> | undefined;
  const erreur = $derived(tente ? (validerMessage({ message }).message ?? '') : '');
  const bloque = $derived(!reseau.enLigne || vue === 'envoi');
  onMount(() => { const b = etat().brouillon; sujet = b.sujet; reference = b.reference; message = b.message; echecForce = etatForce() === 'echec'; });
  onDestroy(() => clearTimeout(minuterie));
  const garder = () => majBrouillon({ sujet, reference, message });

  function envoyer() {
    if (bloque || !compte) return;
    tente = true; if (validerMessage({ message }).message) { document.getElementById('contact-msg')?.focus(); return; }
    vue = 'envoi'; clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      if (echecForce) { echecForce = false; vue = 'echec'; return; }
      const r = envoyerMessage(compte.id, { sujet, reference, message });
      if (r.ok) { demande = r.demande; vue = 'envoye'; sujet = null; reference = ''; message = ''; tente = false; } else vue = 'echec';
    }, 1000);
  }
  function nouveau() { vue = 'saisie'; demande = null; }
  const va = (e: MouseEvent, c: string) => { if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); aller(c); };
</script>

<Ecran titre="Contacter l’assistance" face="nuit" retour="/aide" pied={vue === 'envoye' ? undefined : bas}>
  <div class="cp page">
    <p class="demo" data-demo="bandeau">MODE DÉMO — aucun message n’est réellement envoyé</p>

    {#if vue === 'envoye' && demande}
      <section class="ok" data-etat="envoye" aria-labelledby="ok-titre"><span class="rond"><Pic nom="ok" taille={28} trait={2} /></span><h2 id="ok-titre">Message envoyé (démo)</h2>
        <p>Demande <span class="mono">{demande.numero}</span> (fictive). La réponse sera envoyée à {compte?.email || 'votre adresse'}.</p>
        <a class="btn" href="/aide" onclick={(e) => va(e, '/aide')}>Retour à l’aide</a><button type="button" class="btn sec" onclick={nouveau}>Écrire un autre message</button></section>
    {:else}
      <aside class="secu"><Pic nom="bouclier" taille={22} /><p>Ne partagez jamais votre mot de passe, un code de vérification ou un numéro de carte, même si on vous le demande.</p></aside>
      {#if !reseau.enLigne}<div class="cp-hl" role="status" data-etat="hors-ligne"><Icone nom="hors_ligne" taille={20} /><span class="col"><b>Hors ligne : votre brouillon est conservé sur cet appareil.</b><span class="d">Vous pourrez l’envoyer dès que la connexion reviendra.</span></span></div>{/if}
      {#if vue === 'echec'}<div class="cp-erreur ligne" role="alert" data-etat="echec"><span class="col"><b>Le message n’a pas pu être envoyé.</b><span>Votre brouillon est conservé.</span></span><button type="button" class="btn sm" onclick={envoyer}>Réessayer</button></div>{/if}

      <fieldset class="champs"><legend>Sujet</legend>
        <div class="pastilles">
          {#each SUJETS as s (s.id)}
            <label class="cp-choix pastille"><input type="radio" name="sujet" value={s.id} checked={sujet === s.id} disabled={vue === 'envoi'} onchange={() => { sujet = s.id; garder(); }} />{s.label}</label>
          {/each}
        </div></fieldset>

      <div class="cp-champ"><label for="contact-ref">Référence (facultatif)</label><input id="contact-ref" type="text" autocomplete="off" placeholder="Ex. NXG-7Q2M" maxlength="40" aria-describedby="ref-aide" bind:value={reference} oninput={garder} disabled={vue === 'envoi'} />
        <span id="ref-aide" class="t-aide">Elle figure sur le billet ou le reçu (exemple fictif).</span></div>

      <div class="cp-champ"><label for="contact-msg">Votre message</label>
        <textarea id="contact-msg" rows="5" maxlength={MESSAGE_MAX} aria-required="true" aria-invalid={erreur ? 'true' : undefined} aria-describedby={erreur ? 'msg-aide msg-erreur' : 'msg-aide'} disabled={vue === 'envoi'} bind:value={message} oninput={garder}></textarea>
        {#if erreur}<p class="cp-err" id="msg-erreur" role="alert" data-etat="erreur-saisie"><Icone nom="alerte" taille={16} />{erreur}</p>{/if}
        <span id="msg-aide" class="t-aide">Décrivez ce qui s’est passé, avec les dates utiles.</span></div>

      <p class="sr" role="status" aria-live="polite">{vue === 'envoi' ? 'Envoi du message…' : ''}</p>
      {#if vue === 'envoi'}<p class="env" data-etat="envoi" aria-hidden="true">Envoi du message…</p>{/if}
      <p class="rep">La réponse sera envoyée à {compte?.email || 'votre adresse'}.</p>
    {/if}
  </div>
</Ecran>

{#snippet bas()}
<div class="cp-barre">
  <button type="button" class="btn" data-envoi aria-disabled={bloque ? 'true' : undefined} aria-busy={vue === 'envoi' ? 'true' : undefined} onclick={envoyer}><Pic nom="message" taille={20} />{vue === 'envoi' ? 'Envoi…' : 'Envoyer le message'}</button>
</div>
{/snippet}

<style>
  .page { display: flex; flex-direction: column; gap: 18px; }
  .demo { margin: 0; padding: 10px 12px; border-radius: 12px; background: rgba(98, 199, 255, 0.12); border: 1px solid rgba(98, 199, 255, 0.4); color: var(--up); font-size: 13px; font-weight: 600; }
  .secu { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); } .secu p { margin: 0; font-size: 14px; line-height: 20px; }
  .cp-erreur.ligne { flex-direction: row; align-items: center; justify-content: space-between; text-align: left; padding: 14px 16px; border-radius: 16px; gap: 10px; flex-wrap: wrap; } .cp-erreur.ligne b { font-size: 15px; line-height: 21px; } .cp-erreur.ligne span { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .champs { margin: 0; padding: 0; border: 0; min-width: 0; } .champs legend { margin-bottom: 8px; } .pastilles { display: flex; flex-wrap: wrap; gap: 8px; }
  .pastille.cp-choix { min-height: 44px; border-radius: 999px; padding: 0 14px 0 12px; gap: 10px; font-size: 14px; } .pastille :global(input) { width: 20px; height: 20px; }
  .env { margin: 0; font-size: 14px; font-weight: 600; color: var(--ink2); } .rep { margin: 0; font-size: 13px; line-height: 18px; color: var(--ink2); }
  .ok { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 32px 18px 18px; border-radius: 20px; background: var(--ok-soft); border: 1px solid rgba(124, 227, 181, 0.4); text-align: center; }
  .ok .rond { width: 56px; height: 56px; border-radius: 999px; background: rgba(124, 227, 181, 0.16); color: var(--ok); display: flex; align-items: center; justify-content: center; } .ok h2 { margin: 0; font-size: 20px; line-height: 26px; font-weight: 700; color: var(--ok); } .ok p { margin: 0; font-size: 15px; line-height: 22px; overflow-wrap: anywhere; } .ok .mono { font-weight: 600; } .ok .btn { align-self: stretch; width: auto; }
</style>
