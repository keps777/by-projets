<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { chiffresDe, enregistrerCarte, erreursCarte, formaterExpiration, formaterNumeroCarte, masquerCarte, retirerCarte, retourSur, type ErreursCarte } from './actions.ts';
  import { reseau } from './enligne.svelte.ts';
  import { largeur } from './largeur.svelte.ts';

  /** Carte de paiement facultative (mode démo) : « Plus tard » ou une carte de test dont seuls les 4 derniers chiffres sont gardés. */
  const retour = $derived(retourSur(param('retour')));
  const compte = $derived(compteCourant());
  let formulaire = $state(false), numero = $state(''), exp = $state(''), cvc = $state(''), titulaire = $state('');
  let erreurs = $state<ErreursCarte>({}), envoi = $state(false), tente = $state(false);
  const carte4 = $derived(compte?.carte4);
  const nomCarte = $derived(compte ? `${compte.prenom} ${compte.nom ? compte.nom[0] + '.' : ''}`.trim().toUpperCase() : '');

  function ouvrir() { formulaire = true; queueMicrotask(() => document.getElementById('cc-number')?.focus()); }
  function annuler() { formulaire = false; numero = exp = cvc = titulaire = ''; erreurs = {}; tente = false; }
  const revalider = () => { if (tente) erreurs = erreursCarte({ numero, exp, cvc }); };
  function enregistrer(e: Event) {
    e.preventDefault(); tente = true; if (!reseau.enLigne || !compte) return;
    erreurs = erreursCarte({ numero, exp, cvc });
    if (Object.keys(erreurs).length) { document.getElementById(erreurs.numero ? 'cc-number' : erreurs.exp ? 'cc-exp' : 'cc-csc')?.focus(); return; }
    envoi = true;
    setTimeout(() => { // petit délai : le « prestataire » répond
      const r = enregistrerCarte(compte.id, { numero, exp, cvc });
      numero = exp = cvc = titulaire = ''; // rien d'autre que les 4 derniers chiffres (dans le compte) ne survit
      envoi = false; if (r.ok) { formulaire = false; erreurs = {}; tente = false; }
    }, 450);
  }
  const suite = () => aller(retour);
</script>

{#snippet actions()}
  {#if !carte4 && !formulaire}<button type="button" class="btn sec" onclick={ouvrir}><Icone nom="carte" taille={20} />Ajouter une carte maintenant</button>{/if}
  {#if !carte4}<button type="button" class="btn" onclick={suite}>Plus tard</button>
  {:else}<button type="button" class="btn" onclick={suite}>Continuer<Icone nom="suivant" taille={20} /></button>{/if}
{/snippet}

<Ecran titre="Facultatif" face="jour" retour={retour} large pied={largeur.pc ? undefined : actions}>
  {#if largeur.pc}<div class="bandeau-demo" role="note"><Icone nom="info" taille={20} />MODE DÉMO — aucun paiement réel</div>{/if}
  <div class="grille">
    <div class="gauche">
      {#if largeur.pc}<span class="facultatif">Facultatif</span>{/if}
      <h1 class="t-titre">Ajouter une carte ? <span class="bleu">Pas obligatoire.</span></h1>

      {#if carte4}
        <div class="visuel plein" role="img" aria-label="Carte de test enregistrée, se terminant par {carte4}">
          <span class="haut"><span class="puce-carte"></span><span class="etiq">CARTE DE TEST</span></span>
          <span class="num mono">{masquerCarte(carte4)}</span>
          <span class="bas"><span>{nomCarte}</span><span class="mono">••/••</span></span>
        </div>
      {:else}
        <div class="visuel vide" role="img" aria-label="Emplacement de carte vide : aucune carte enregistrée">
          <span class="v-puce"></span><span class="l1"></span><span class="l2"></span><span class="l3"></span><span class="plus"><Icone nom="plus" taille={20} /></span>
        </div>
      {/if}

      <section class="bloc" aria-label="Aucun débit"><p class="t-bloc">Vous ne payez rien maintenant.</p>
        <p class="txt">Une carte n'est demandée qu'au moment d'acheter. Vous pourrez aussi l'ajouter plus tard dans Compte › Paiement.</p></section>
    </div>

    <div class="droite">
    {#if !reseau.enLigne}<p class="hors" role="alert"><Icone nom="hors_ligne" taille={18} />Vous êtes hors ligne : l'enregistrement d'une carte attend le retour du réseau.</p>{/if}
    
      {#if formulaire && !carte4}
        <form class="bloc form" aria-labelledby="card-form-title" onsubmit={enregistrer} novalidate>
          <h2 id="card-form-title" class="t-section">Ajouter une carte</h2>
          {#if !largeur.pc}<p class="demo" role="note">MODE DÉMO — aucun paiement réel</p>{/if}
          <div class="champ" data-erreur={erreurs.numero ? '' : undefined}><label for="cc-number">Numéro de carte (carte de test)</label>
            <input id="cc-number" class="mono" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" value={numero} oninput={(e) => { numero = formaterNumeroCarte(e.currentTarget.value); e.currentTarget.value = numero; revalider(); }} aria-invalid={erreurs.numero ? 'true' : undefined} aria-describedby={erreurs.numero ? 'cc-number-e' : 'cc-number-a'} />
            {#if erreurs.numero}<span class="erreur" id="cc-number-e" role="alert"><Icone nom="alerte" taille={16} />{erreurs.numero}</span>{:else}<span class="aide" id="cc-number-a">Carte de test : 4242 4242 4242 4242, date future, code à 3 chiffres.</span>{/if}</div>
          <div class="deux">
            <div class="champ" data-erreur={erreurs.exp ? '' : undefined}><label for="cc-exp">Expiration (MM/AA)</label>
              <input id="cc-exp" class="mono" type="text" inputmode="numeric" autocomplete="cc-exp" placeholder="12/28" value={exp} oninput={(e) => { exp = formaterExpiration(e.currentTarget.value); e.currentTarget.value = exp; revalider(); }} aria-invalid={erreurs.exp ? 'true' : undefined} aria-describedby={erreurs.exp ? 'cc-exp-e' : undefined} />
              {#if erreurs.exp}<span class="erreur" id="cc-exp-e" role="alert"><Icone nom="alerte" taille={16} />{erreurs.exp}</span>{/if}</div>
            <div class="champ" data-erreur={erreurs.cvc ? '' : undefined}><label for="cc-csc">Code de sécurité</label>
              <input id="cc-csc" class="mono" type="text" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="3" value={cvc} oninput={(e) => { cvc = chiffresDe(e.currentTarget.value).slice(0, 3); e.currentTarget.value = cvc; revalider(); }} aria-invalid={erreurs.cvc ? 'true' : undefined} aria-describedby={erreurs.cvc ? 'cc-csc-e' : undefined} />
              {#if erreurs.cvc}<span class="erreur" id="cc-csc-e" role="alert"><Icone nom="alerte" taille={16} />{erreurs.cvc}</span>{/if}</div>
          </div>
          <div class="champ"><label for="cc-name">Nom sur la carte</label><input id="cc-name" type="text" autocomplete="cc-name" bind:value={titulaire} /></div>
          <p class="garde"><Icone nom="cadenas" taille={18} /><span>Paiement traité par un prestataire certifié ; NexG-TT ne conserve pas votre numéro de carte. Rien n'est débité à l'enregistrement.</span></p>
          {#if largeur.pc}<div class="ligne-pc"><button type="submit" class="btn cta" disabled={envoi || !reseau.enLigne}>{envoi ? 'Enregistrement…' : 'Enregistrer la carte de test'}</button>
            <button type="button" class="btn sec cta2" onclick={annuler}>Annuler</button></div>
          {:else}<button type="submit" class="btn fonce" disabled={envoi || !reseau.enLigne}>{envoi ? 'Enregistrement…' : 'Enregistrer la carte de test'}</button>
            <button type="button" class="btn texte annule" onclick={annuler}>Annuler</button>{/if}
        </form>
      {/if}
    
      {#if carte4}
        <div class="ok" role="status"><Icone nom="ok" taille={20} trait={2.25} /><span class="grow">Carte de test enregistrée. Aucun montant débité.</span>
          <button type="button" class="retirer" onclick={() => compte && retirerCarte(compte.id)}>Retirer</button></div>
      {/if}
      {#if largeur.pc}<div class="act">{@render actions()}</div>{/if}
    </div>
  </div>
</Ecran>

<style>
  .t-titre { font: 600 40px/42px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: -0.005em; overflow-wrap: anywhere; } .bleu { display: block; color: var(--accent); }
  .visuel { position: relative; align-self: center; width: min(300px, 100%); aspect-ratio: 300 / 188; border-radius: 18px; }
  .vide { border: 2px dashed #8494A9; background: rgba(255, 255, 255, 0.55); }
  .vide > span { position: absolute; } .v-puce { left: 22px; top: 26px; width: 42px; height: 32px; border-radius: 6px; border: 2px dashed var(--line-strong); }
  .l1 { left: 22px; bottom: 54px; width: 65%; height: 12px; border-radius: 999px; background: var(--surface2); } .l2 { left: 22px; bottom: 28px; width: 35%; height: 10px; border-radius: 999px; background: var(--surface2); } .l3 { right: 22px; bottom: 28px; width: 15%; height: 10px; border-radius: 999px; background: var(--surface2); }
  .plus { right: 20px; top: 20px; width: 44px; height: 44px; border-radius: 999px; background: #fff; border: 1px solid var(--line); color: var(--ink3); display: flex; align-items: center; justify-content: center; }
  .plein { padding: 22px; background: #0B1B2E; color: #fff; box-shadow: 0 12px 32px rgba(11, 27, 46, 0.22); display: flex; flex-direction: column; justify-content: space-between; animation: nx-rise 360ms cubic-bezier(.2, .7, .2, 1) both; }
  .haut { display: flex; justify-content: space-between; align-items: center; } .puce-carte { width: 42px; height: 32px; border-radius: 6px; background: #C9D3DF; }
  .etiq { font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.14em; color: #C9D3DF; }
  .num { font-size: 18px; letter-spacing: 0.04em; white-space: nowrap; font-variant-numeric: tabular-nums; } .bas { display: flex; justify-content: space-between; font: 600 13px/1 'Barlow', sans-serif; letter-spacing: 0.06em; color: #C9D3DF; }
  .bloc { display: flex; flex-direction: column; gap: 10px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .t-bloc { font: 600 30px/32px 'Barlow Condensed', 'Arial Narrow', sans-serif; } .txt { font-size: 16px; line-height: 23px; color: var(--ink2); }
  .form { gap: 14px; animation: nx-rise 300ms cubic-bezier(.2, .7, .2, 1) both; }
  .demo { padding: 10px 12px; border-radius: 12px; background: var(--accent-soft); border: 1px solid rgba(26, 100, 200, 0.4); color: var(--accent); font: 700 13px/18px 'Barlow', sans-serif; letter-spacing: 0.02em; }
  .champ input.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; } .champ input { width: 100%; min-width: 0; }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .deux .champ { min-width: 0; }
  .garde { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; line-height: 19px; color: var(--ink2); }
  .fonce { background: #0B1B2E; color: #fff; } .fonce:hover { background: #16314f; } .annule { align-self: center; font-size: 15px; }
  .ok { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 10px 14px; border-radius: 14px; background: var(--ok-soft); color: var(--ok); font: 600 14px/20px 'Barlow', sans-serif; }
  .retirer { flex: none; min-height: 44px; padding: 0 4px; border: 0; background: transparent; color: var(--accent-2); font: 600 14px/1 'Barlow', sans-serif; cursor: pointer; }
  .hors { display: flex; align-items: flex-start; gap: 8px; padding: 12px 14px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 500 13px/18px 'Barlow', sans-serif; }
  @keyframes nx-rise { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); } }
  .grille, .gauche, .droite { display: contents; } .bandeau-demo, .facultatif { display: none; } .ligne-pc { display: contents; }
  @media (min-width: 900px) {
    .bandeau-demo { order: -1; display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 16px; border-radius: 12px; background: var(--accent-soft); color: var(--accent-2); font: 700 14px/20px 'Barlow', sans-serif; letter-spacing: 0.04em; }
    .grille { display: grid; grid-template-columns: minmax(300px, 520px) minmax(0, 640px); gap: 32px; align-items: start; }
    .gauche { display: flex; flex-direction: column; gap: 22px; min-width: 0; } .droite { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .facultatif { align-self: flex-start; display: inline-flex; align-items: center; min-height: 32px; padding: 0 14px; border-radius: 999px; background: var(--surface2); color: var(--ink2); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; }
    .t-titre { font-size: 44px; line-height: 44px; text-wrap: balance; }
    .visuel { align-self: flex-start; width: 100%; max-width: 380px; border-radius: 20px; }
    .vide { border-color: #7A8597; background: #F5F8FB; } .v-puce { left: 22px; top: 22px; width: 44px; height: 34px; border-radius: 8px; border-color: var(--line-strong); }
    .plus { right: 18px; top: 18px; border-color: #7A8597; color: var(--ink2); } .l1 { right: 22px; width: auto; bottom: 48px; } .l2 { width: 90px; } .l3 { width: 48px; }
    .puce-carte { width: 44px; height: 34px; border-radius: 8px; background: #FFD23F; } .num { font-size: 22px; font-weight: 600; } .bas { font: 400 14px/1 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0; }
    .bloc { padding: 22px; gap: 14px; } .txt { line-height: 24px; }
    .form h2 { margin: 0; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; } .form { padding: 22px; }
    .garde { font-size: 14px; line-height: 20px; }
    .ligne-pc { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
    .cta, .cta2 { width: auto; min-width: 200px; min-height: 56px; padding: 8px 22px; font-size: 17px; } .cta2 { font-size: 16px; border-color: #7A8597; }
    .ok { padding: 14px 16px; border-radius: 16px; border: 1px solid var(--ok); font-size: 16px; }
    .act { display: flex; flex-direction: column; gap: 12px; max-width: 420px; } .act .btn { min-height: 56px; font-size: 16px; } .act .btn:not(.sec) { font-size: 17px; }
  }
</style>
