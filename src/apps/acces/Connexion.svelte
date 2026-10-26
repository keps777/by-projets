<script lang="ts">
  import { onMount } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pictos from './Pictos.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { DELAI_CLE_MS, commencerBrouillon, compteDeLAppareil, compteExistant, confirmerCleAcces, demanderCode, identifiantValide, initiales, normaliserIdentifiant, oublierAppareil, typeDe } from './actions.ts';
  import { reseau } from './reseau.svelte.ts';
  import { va } from './nav.ts';

  /** Retour d'un compte existant : clé d'accès simulée, repli par code. Sans appareil connu : saisie de l'identifiant. */
  let appareil = $state(compteDeLAppareil());
  let feuille = $state(false), cleEchec = $state(param('etat') === 'erreur'), envoi = $state(false);
  let identifiant = $state(''), erreur = $state(''), inconnu = $state(false), secousse = $state(0);
  let minuterie: ReturnType<typeof setTimeout> | undefined, jeton = 0;
  const horsLigne = $derived(!reseau.enLigne || param('etat') === 'horsligne');
  onMount(() => () => clearTimeout(minuterie));

  function cle() {
    if (!appareil || horsLigne || feuille) return;
    cleEchec = false; feuille = true; const mien = ++jeton;
    minuterie = setTimeout(async () => {
      if (mien !== jeton || !appareil) return;
      const refuser = param('etat') === 'erreur';
      const ok = await confirmerCleAcces(appareil.id, { delai: 0, refuser });
      feuille = false;
      if (ok) aller('/'); else cleEchec = true;
    }, DELAI_CLE_MS);
  }
  function annulerCle() { jeton++; clearTimeout(minuterie); feuille = false; }
  async function envoyerCode(type: 'email' | 'tel', valeur: string) {
    if (envoi || horsLigne) return;
    envoi = true; const r = await demanderCode({ enLigne: reseau.enLigne }); envoi = false; if (!r.ok) return;
    commencerBrouillon(type, valeur); aller('/code?mode=connexion');
  }
  const parCourriel = () => appareil && void envoyerCode('email', appareil.email);
  function pasMoi() { oublierAppareil(); appareil = undefined; cleEchec = false; }
  function continuer(e: SubmitEvent) {
    e.preventDefault(); inconnu = false;
    const v = identifiant.trim(), type = typeDe(v);
    erreur = !v ? 'Ce champ est vide : indiquez votre courriel ou votre téléphone.' : identifiantValide(type, v) ? '' : type === 'email' ? 'Cette adresse courriel semble incomplète : vérifiez-la.' : 'Ce numéro doit compter 10 chiffres, par exemple 514 555 0142.';
    if (erreur) { secousse++; document.getElementById('connexion-id')?.focus(); return; }
    const norm = normaliserIdentifiant(type, v);
    if (!compteExistant(norm)) { inconnu = true; secousse++; return; }
    void envoyerCode(type, norm);
  }
</script>

<Ecran titre="NexG-TT" face="jour">
  {#if horsLigne}
    <div class="bandeau" role="status"><Icone nom="hors_ligne" /><div><b>Hors ligne</b><span>La connexion demande le réseau : la clé d’accès et le code par courriel sont suspendus. Rien n’a été envoyé.</span></div></div>
  {/if}
  {#if appareil && cleEchec}
    <div class="bandeau err" role="alert"><Icone nom="info" /><div><b>Clé d’accès non reconnue</b><span>Votre appareil n’a pas confirmé la clé d’accès (confirmation annulée ou clé non reconnue). Aucune connexion n’a eu lieu. Réessayez, ou recevez un code par courriel.</span></div><button type="button" class="btn sm sec" onclick={() => { cleEchec = false; cle(); }}>Réessayer</button></div>
  {/if}

  {#if appareil}
    <section class="accueil">
      <span class="avatar" aria-hidden="true">{initiales(appareil)}</span>
      <h1 class="t-h1">Bon retour, {appareil.prenom}</h1>
      <p class="courriel">{appareil.email}</p>
    </section>
    <div class="col g8">
      <button type="button" class="cle" aria-describedby="pk-aide" aria-disabled={horsLigne} onclick={cle}>
        <span class="empreinte" aria-hidden="true"><span class="onde"></span><span class="noyau"><Icone nom="empreinte" taille={32} trait={1.6} /></span></span>
        <span class="textes"><span class="titre">Se connecter avec une clé d’accès</span><span class="sous">Empreinte, visage ou code de votre appareil</span></span>
        <Pictos nom="fleche" taille={22} />
      </button>
      <p class="aide-cle" id="pk-aide"><Icone nom="cadenas" taille={16} />Aucun mot de passe : votre téléphone confirme que c’est bien vous.</p>
    </div>
    <div class="ou" aria-hidden="true"><span></span>ou<span></span></div>
    <div class="col g4">
      <button type="button" class="btn sec" aria-disabled={horsLigne || envoi} onclick={parCourriel}>{#if envoi}<span class="tourne" aria-hidden="true"></span>Envoi du code en cours…{:else}<Icone nom="courriel" taille={20} />Recevoir un code par courriel{/if}</button>
      <button type="button" class="pas-moi" onclick={pasMoi}>Ce n’est pas moi</button>
    </div>
  {:else}
    <section class="col g8">
      <h1 class="t-h1">Connectez-vous</h1>
      <p class="intro">Entrez votre courriel ou votre téléphone : nous vous enverrons un code à 6 chiffres.</p>
    </section>
    <form class="col g12" onsubmit={continuer} novalidate>
      <div class="champ-id" class:s0={(erreur || inconnu) && secousse % 2 === 1} class:s1={(erreur || inconnu) && secousse % 2 === 0}>
        <Champ id="connexion-id" label="Courriel ou téléphone" type="text" inputmode="email" autocomplete="username" placeholder="prenom.nom@exemple.test ou 514 555 0142" bind:valeur={identifiant} {erreur} aide="Le compte est retrouvé avec l’un ou l’autre." onsaisie={() => { erreur = ''; inconnu = false; }} />
      </div>
      {#if inconnu}<p class="inconnu" role="alert"><Icone nom="info" taille={16} trait={2} /><span><b>Aucun compte pour cet identifiant.</b> <a href="/inscription" onclick={(e) => va(e, '/inscription')}>Créer un compte</a></span></p>{/if}
      <button type="submit" class="btn" aria-disabled={horsLigne || envoi}>{#if envoi}<span class="tourne" aria-hidden="true"></span>Envoi du code en cours…{:else}Continuer<Pictos nom="fleche" />{/if}</button>
    </form>
    <p class="liens"><a href="/inscription" onclick={(e) => va(e, '/inscription')}>Créer un compte</a><a href="/" onclick={(e) => va(e, '/')}>Explorer sans compte</a></p>
  {/if}

  <aside class="securite" aria-labelledby="sec-titre">
    <span class="bouclier" aria-hidden="true"><Icone nom="verifie" taille={20} /></span>
    <span class="col g4"><span id="sec-titre" class="sec-titre">Nous ne vous demanderons jamais votre code par téléphone.</span><span class="t-sec">Ne le communiquez à personne, même à quelqu’un qui se présente comme NexG-TT.</span>
      <span class="hyp"><b class="puce-h">[H]</b>Connexion par clé d’accès : hypothèse à valider avec la double authentification (EF-01). Aucune règle de sécurité n’est décidée ici.</span></span>
  </aside>
  <p class="proto">Prototype · données fictives</p>
</Ecran>

<Feuille bind:ouvert={feuille} titre="Clé d’accès" surfermer={annulerCle}>
  <div class="confirmer"><span class="noyau grand" aria-hidden="true"><Icone nom="empreinte" taille={36} trait={1.6} /></span>
    <p class="gras">Confirmez avec votre empreinte, votre visage ou le code de votre appareil</p>
    <p class="note" role="status"><span class="tourne" aria-hidden="true"></span>Confirmation sur votre appareil en cours…</p></div>
</Feuille>

<style>
  .accueil { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding-top: 8px; }
  .avatar { width: 76px; height: 76px; border-radius: 999px; background: #0B1B2E; color: #fff; display: grid; place-items: center; font: 700 30px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.06em; box-shadow: 0 0 0 6px #fff, 0 12px 32px rgba(11, 27, 46, 0.18); }
  .accueil h1 { margin-top: 6px; font-size: 44px; line-height: 44px; overflow-wrap: anywhere; } .courriel { font-size: 15px; color: var(--ink2); overflow-wrap: anywhere; }
  .cle { display: flex; align-items: center; gap: 16px; min-height: 112px; padding: 18px; width: 100%; box-sizing: border-box; border: 0; border-radius: 20px; background: var(--signal); color: #0B1B2E; text-align: left; cursor: pointer; font-family: inherit; }
  .cle:hover { background: var(--signal-2); } .cle[aria-disabled='true'] { opacity: 0.5; cursor: not-allowed; }
  .empreinte { position: relative; flex: none; width: 60px; height: 60px; }
  .onde { position: absolute; inset: 0; border-radius: 999px; border: 2px solid #0B1B2E; animation: ring 2s ease-out infinite; }
  .noyau { position: absolute; inset: 0; border-radius: 999px; background: #0B1B2E; color: var(--signal); display: grid; place-items: center; }
  .noyau.grand { position: static; width: 84px; height: 84px; }
  .textes { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; } .titre { font-size: 18px; line-height: 22px; font-weight: 700; } .sous { font-size: 14px; line-height: 19px; font-weight: 500; }
  .aide-cle { margin: 0; display: flex; align-items: flex-start; gap: 8px; font-size: 14px; line-height: 20px; color: var(--ink2); } .aide-cle :global(svg) { margin-top: 2px; }
  .ou { display: flex; align-items: center; gap: 12px; font: 600 13px/1 'Barlow', sans-serif; color: var(--ink3); } .ou span { flex: 1; border-top: 1px solid var(--line); }
  .btn.sec { border-color: var(--line-strong); } .btn[aria-disabled='true'] { opacity: 0.6; cursor: not-allowed; }
  .pas-moi { align-self: center; min-height: 44px; padding: 0 8px; border: 0; background: none; color: var(--accent); font: 600 15px/1 'Barlow', sans-serif; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .intro { font-size: 15px; line-height: 22px; color: var(--ink2); }
  .inconnu { margin: 0; display: flex; align-items: flex-start; gap: 6px; font: 500 14px/20px 'Barlow', sans-serif; color: var(--err); } .inconnu :global(svg) { margin-top: 2px; flex: none; } .inconnu a { font-weight: 700; margin-left: 4px; }
  .liens { margin: 0; display: flex; justify-content: space-between; gap: 8px; } .liens a { display: flex; align-items: center; min-height: 44px; padding: 0 4px; font-size: 15px; font-weight: 600; }
  .securite { margin-top: auto; display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .bouclier { flex: none; width: 36px; height: 36px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; }
  .sec-titre { font-size: 15px; line-height: 20px; font-weight: 700; }
  .hyp { margin-top: 6px; font-size: 12px; line-height: 17px; color: var(--ink3); } .puce-h { display: inline-block; margin-right: 6px; padding: 0 6px; border-radius: 4px; background: var(--signal-soft); color: var(--signal-ink); font-size: 11px; }
  .proto { margin: -6px 0 0; text-align: center; font-size: 12px; color: var(--ink3); }
  .bandeau { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--surface2); border: 1px solid #7A8597; font-size: 14px; line-height: 20px; color: var(--ink2); flex-wrap: wrap; }
  .bandeau > div { flex: 1 1 200px; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .bandeau b { font-size: 15px; color: var(--ink); }
  .bandeau.err { background: var(--err-soft); border-color: var(--err); } .bandeau.err b, .bandeau.err > :global(svg) { color: var(--err); }
  .confirmer { display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; padding: 8px 0 16px; } .confirmer .noyau { background: #0B1B2E; border-radius: 999px; display: grid; place-items: center; color: var(--signal); }
  .gras { font-size: 17px; line-height: 24px; font-weight: 700; } .note { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--ink2); }
  .tourne { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line-strong); border-top-color: var(--accent); animation: tourne 0.8s linear infinite; }
  .btn .tourne { border-color: rgba(11, 27, 46, 0.25); border-top-color: var(--ink); }
  .s0 { animation: -global-nx-shake 420ms ease-out 1; } .s1 { animation: secoue 420ms ease-out 1; }
  @keyframes secoue { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(2px); } }
  @keyframes ring { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(1.45); opacity: 0; } }
  @keyframes tourne { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .onde, .tourne, .s0, .s1 { animation: none; } .onde { display: none; } }
  @media (max-width: 340px) { .accueil h1 { font-size: 36px; line-height: 38px; } .cle { gap: 12px; padding: 14px; } .titre { font-size: 16px; } }
</style>
