<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pictos from './Pictos.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { courrielValide, telephoneValide } from '../../domain/compte.ts';
  import { commencerBrouillon, compteExistant, demanderCode, formaterTelephone, normaliserIdentifiant, type TypeId } from './actions.ts';
  import { reseau } from './reseau.svelte.ts';
  import { va } from './nav.ts';

  /** Créer un compte : un code suffit (courriel ou téléphone). Brouillon dans `app.session.inscription`, puis `/code`. */
  let onglet = $state<TypeId>('email');
  let email = $state(''), tel = $state('');
  let consentement = $state(false), infolettre = $state(false), conditions = $state(false);
  let erreurChamp = $state(''), erreurConsentement = $state(false), secousse = $state(0);
  let sso = $state(''), envoi = $state<'repos' | 'charge' | 'echec'>(param('etat') === 'chargement' ? 'charge' : param('etat') === 'erreur' ? 'echec' : 'repos');
  const horsLigne = $derived(!reseau.enLigne || param('etat') === 'horsligne');
  const valeur = $derived(onglet === 'email' ? email : tel);
  const resume = $derived(erreurChamp && erreurConsentement ? 'Deux points à corriger : le champ et la case des conditions.' : erreurChamp ? (onglet === 'email' ? 'Indiquez votre adresse courriel.' : 'Indiquez votre numéro de téléphone.') : erreurConsentement ? 'Acceptez les conditions pour recevoir votre code.' : '');
  let forcerEchec = param('etat') === 'erreur';

  const onglets: TypeId[] = ['email', 'tel'];
  function toucheOnglet(e: KeyboardEvent) {
    const i = onglets.indexOf(onglet); let j = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % 2; else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + 1) % 2; else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = 1; else return;
    e.preventDefault(); choisir(onglets[j]); document.getElementById(onglets[j] === 'email' ? 'onglet-courriel' : 'onglet-tel')?.focus();
  }
  function choisir(t: TypeId) { onglet = t; erreurChamp = ''; if (envoi === 'echec') envoi = 'repos'; }

  function verifier(): boolean {
    const v = valeur.trim();
    erreurChamp = !v ? 'Ce champ est vide : indiquez où recevoir le code.' : onglet === 'email' ? (courrielValide(v) ? '' : 'Cette adresse courriel semble incomplète : vérifiez-la.') : telephoneValide(v) ? '' : 'Ce numéro doit compter 10 chiffres, par exemple 514 555 0142.';
    erreurConsentement = !consentement;
    if (erreurChamp || erreurConsentement) { secousse++; document.getElementById(erreurChamp ? (onglet === 'email' ? 'inscription-courriel' : 'inscription-tel') : 'consent')?.focus(); return false; }
    return true;
  }
  async function envoyer() {
    if (envoi === 'charge' || horsLigne) return;
    if (!verifier()) return;
    envoi = 'charge';
    const r = await demanderCode({ enLigne: reseau.enLigne, echec: forcerEchec });
    if (!r.ok) { envoi = 'echec'; return; }
    commencerBrouillon(onglet, valeur);
    aller(compteExistant(normaliserIdentifiant(onglet, valeur)) ? '/code?mode=connexion' : '/code');
  }
  function reessayer() { forcerEchec = false; envoi = 'repos'; void envoyer(); }
  function sousSelection(nom: string) { sso = nom; }
</script>

<Ecran titre="Créer un compte" face="jour">
  {#if horsLigne}
    <div class="bandeau" role="status"><Icone nom="hors_ligne" /><div><b>Hors ligne</b><span>Vous pouvez remplir le formulaire. L’envoi du code et la connexion avec Apple ou Google demandent le réseau : rien n’a été envoyé.</span></div></div>
  {/if}
  {#if envoi === 'echec'}
    <div class="bandeau err" role="alert"><Icone nom="info" /><div><b>Le code n’a pas pu être envoyé</b><span>Nous n’avons pas pu envoyer le code à l’adresse indiquée. Aucun compte n’a été créé. Vérifiez l’adresse puis réessayez.</span></div><button type="button" class="btn sm sec" onclick={reessayer}>Réessayer</button></div>
  {/if}

  <section class="col g8">
    <h1 class="t-h1">Créez votre compte en 1 minute</h1>
    <p class="intro">Un code suffit. Vous compléterez le reste seulement quand ce sera utile.</p>
  </section>

  <ul class="puces" aria-label="Ce que nous ne vous demandons pas">
    <li><span class="rond" aria-hidden="true"><Icone nom="carte" taille={20} /></span><span>Aucune carte demandée</span></li>
    <li><span class="rond" aria-hidden="true"><Pictos nom="boussole" taille={20} trait={1.75} /></span><span>Explorer sans compte possible</span></li>
    <li><span class="rond" aria-hidden="true"><Icone nom="piece" taille={20} /></span><span>Identité vérifiée seulement pour revendre</span></li>
  </ul>

  <section class="col g12">
    <div class="onglets" role="tablist" aria-label="Recevoir le code par">
      <button type="button" role="tab" id="onglet-courriel" aria-controls="panneau" aria-selected={onglet === 'email'} tabindex={onglet === 'email' ? 0 : -1} onclick={() => choisir('email')} onkeydown={toucheOnglet}><Icone nom="courriel" taille={18} />Courriel</button>
      <button type="button" role="tab" id="onglet-tel" aria-controls="panneau" aria-selected={onglet === 'tel'} tabindex={onglet === 'tel' ? 0 : -1} onclick={() => choisir('tel')} onkeydown={toucheOnglet}><Icone nom="telephone" taille={18} />Téléphone</button>
    </div>
      <div id="panneau" class="panneau" class:s0={erreurChamp && secousse % 2 === 0} class:s1={erreurChamp && secousse % 2 === 1} role="tabpanel" aria-labelledby={onglet === 'email' ? 'onglet-courriel' : 'onglet-tel'}>
        {#if onglet === 'email'}
          <Champ id="inscription-courriel" label="Adresse courriel" type="email" inputmode="email" autocomplete="email" placeholder="prenom.nom@exemple.test" bind:valeur={email} erreur={erreurChamp} aide="Nous y enverrons un code à 6 chiffres." onsaisie={() => (erreurChamp = '')} />
        {:else}
          <Champ id="inscription-tel" label="Numéro de téléphone mobile" type="tel" inputmode="tel" autocomplete="tel" placeholder="514 555 0142" bind:valeur={tel} erreur={erreurChamp} aide="Nous y enverrons un code à 6 chiffres par texto." onsaisie={(v) => { tel = formaterTelephone(v); erreurChamp = ''; }} />
        {/if}
      </div>
  </section>

  <div class="ou" aria-hidden="true"><span></span>ou<span></span></div>

  <div class="col g8">
    <button type="button" class="btn sec" onclick={() => sousSelection('Apple')}><Icone nom="cle" taille={20} />Continuer avec Apple</button>
    <button type="button" class="btn sec" onclick={() => sousSelection('Google')}><Icone nom="moi" taille={20} />Continuer avec Google</button>
    <div role="status" aria-live="polite">{#if sso}<p class="info"><Icone nom="info" taille={16} /><span>Démo : la connexion avec {sso} n’est pas encore branchée (fournisseur à valider). Utilisez le courriel ou le téléphone.</span></p>{/if}</div>
  </div>

  <section class="col g8" aria-label="Consentements">
      <div class="consent" class:erreur={erreurConsentement} class:s0={erreurConsentement && secousse % 2 === 0} class:s1={erreurConsentement && secousse % 2 === 1}>
        <label class="case" for="consent"><input id="consent" type="checkbox" bind:checked={consentement} onchange={() => (erreurConsentement = false)} aria-invalid={erreurConsentement ? 'true' : undefined} aria-describedby={erreurConsentement ? 'consent-err' : undefined} /><span class="gras">J’accepte les conditions d’utilisation et la politique de confidentialité <span class="leger">(obligatoire)</span></span></label>
        <button type="button" class="lire" aria-expanded={conditions} aria-controls="conditions" onclick={() => (conditions = !conditions)}>Lire les conditions en bref<span class="chev" class:ouvert={conditions}><Icone nom="suivant" taille={16} trait={2} /></span></button>
        <div id="conditions">{#if conditions}<ul class="resume"><li>Créer un compte et explorer ne demande aucune carte.</li><li>Votre identité est vérifiée seulement pour revendre, recevoir un paiement ou nommer un voyageur.</li><li>Vous choisissez ce que vous partagez ; vous pouvez fermer votre compte.</li><li>Texte complet en cours de rédaction avec un juriste (prototype).</li></ul>{/if}</div>
        {#if erreurConsentement}<p class="msg-err" id="consent-err" role="alert"><Icone nom="info" taille={16} trait={2} />Cochez cette case pour recevoir votre code.</p>{/if}
      </div>
    <label class="case carte-case" for="infolettre"><input id="infolettre" type="checkbox" bind:checked={infolettre} /><span class="col g4"><span class="gras">M’écrire au sujet des drops et nouveautés</span><span class="t-sec">Facultatif · désactivé par défaut · modifiable dans Compte</span></span></label>
  </section>

  {#snippet pied()}
    <div class="barre">
      {#if resume}<p class="resume-err" aria-hidden="true"><Icone nom="info" taille={16} trait={2} /><span>{resume}</span></p>{/if}
      <button type="button" class="btn" aria-disabled={envoi === 'charge' || horsLigne} onclick={envoyer}>{#if envoi === 'charge'}<span class="tourne" aria-hidden="true"></span>Envoi du code en cours…{:else}Recevoir mon code<Pictos nom="fleche" />{/if}</button>
      <div class="liens"><a href="/" onclick={(e) => va(e, '/')}>Explorer sans compte</a><a href="/connexion" onclick={(e) => va(e, '/connexion')}>J’ai déjà un compte</a></div>
    </div>
  {/snippet}
</Ecran>

<style>
  .intro { font-size: 15px; line-height: 22px; color: var(--ink2); }
  .puces { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .puces li { display: flex; flex-direction: column; gap: 8px; padding: 12px 10px 12px 12px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); font-size: 13px; line-height: 17px; font-weight: 700; overflow-wrap: anywhere; }
  .rond { width: 36px; height: 36px; border-radius: 999px; background: var(--ok-soft); color: var(--ok); display: grid; place-items: center; }
  .onglets { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 14px; background: var(--surface2); }
  .onglets button { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; border: 0; border-radius: 10px; background: transparent; color: var(--ink2); font: 600 15px/1 'Barlow', sans-serif; cursor: pointer; }
  .onglets button[aria-selected='true'] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(11, 27, 46, 0.16); }
  :global(#inscription-tel) { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  :global(#inscription-courriel), :global(#inscription-tel) { border-color: #7A8597; }
  .ou { display: flex; align-items: center; gap: 12px; font: 600 13px/1 'Barlow', sans-serif; color: var(--ink3); }
  .ou span { flex: 1; border-top: 1px solid var(--line); }
  .btn.sec { border-color: var(--line-strong); }
  .info { margin: 0; display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--accent-soft); color: var(--ink); font-size: 13px; line-height: 18px; }
  .info :global(svg) { color: var(--accent); margin-top: 1px; }
  .consent { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
  .consent.erreur { border: 2px solid var(--err); padding: 13px; }
  .case { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; cursor: pointer; }
  .case input { width: 24px; height: 24px; margin: 0; flex: none; accent-color: var(--accent); cursor: pointer; }
  .carte-case { padding: 14px; box-sizing: border-box; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
  .gras { font-size: 15px; line-height: 21px; font-weight: 600; } .leger { font-weight: 500; color: var(--ink2); }
  .lire { align-self: flex-start; display: flex; align-items: center; gap: 6px; min-height: 44px; margin-left: 36px; padding: 0; border: 0; background: transparent; color: var(--accent); font: 600 15px/1 'Barlow', sans-serif; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .chev { display: inline-flex; transition: transform 200ms ease; } .chev.ouvert { transform: rotate(90deg); }
  .resume { margin: 0 0 0 36px; padding: 10px 12px 10px 28px; border-radius: 10px; background: var(--bg); font-size: 13px; line-height: 19px; color: var(--ink2); display: flex; flex-direction: column; gap: 4px; }
  .msg-err, .resume-err { margin: 0; display: flex; align-items: center; gap: 6px; font: 600 13px/18px 'Barlow', sans-serif; color: var(--err); }
  .resume-err { margin-bottom: 4px; }
  .bandeau { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--surface2); border: 1px solid #7A8597; font-size: 14px; line-height: 20px; color: var(--ink2); flex-wrap: wrap; }
  .bandeau > div { flex: 1 1 200px; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .bandeau b { font-size: 15px; color: var(--ink); }
  .bandeau.err { background: var(--err-soft); border-color: var(--err); } .bandeau.err b, .bandeau.err > :global(svg) { color: var(--err); }
  .barre { display: flex; flex-direction: column; gap: 6px; }
  .liens { display: flex; justify-content: space-between; gap: 8px; }
  .liens a { display: flex; align-items: center; min-height: 44px; padding: 0 4px; font-size: 15px; font-weight: 600; }
  .tourne { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(11, 27, 46, 0.3); border-top-color: #0B1B2E; animation: tourne 0.8s linear infinite; }
  .s0 { animation: -global-nx-shake 420ms ease-out 1; } .s1 { animation: secoue1 420ms ease-out 1; }
  @keyframes secoue1 { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(2px); } }
  @keyframes tourne { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .s0, .s1, .tourne { animation: none; } }
  .btn[aria-disabled='true'] { opacity: 0.6; cursor: progress; }
  @media (max-width: 899px) { :global(.pied:has(.barre)) { background: #fff; border-top: 1px solid var(--line); } }
  @media (max-width: 340px) { .puces { gap: 6px; } .puces li { padding: 10px 8px; font-size: 12px; } }
</style>
