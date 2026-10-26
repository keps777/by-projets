<script lang="ts">
  import { onDestroy } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fmt } from '../../core/argent.ts';
  import { FRAIS_SERVICE } from '../../core/regles.ts';
  import { aller } from '../../router.svelte.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, totalAPayer, volDe } from '../../domain/marche.ts';
  import { payer } from './actions.ts';
  import { chronologie } from './chrono.ts';
  import { heure, jourCourt } from './dates.ts';
  import { naviguer } from './lien.ts';
  import { CARTE_DE_TEST, DELAI_TRAITEMENT_MS, erreurCvc, erreurExpiration, erreurMobile, erreurNom, erreurNumero, formaterExpiration, formaterNumero, type ChoixMoyen } from './moyens.ts';
  import { libelleTypeOffre, obstacleAchat, trouverOffre } from './offre.ts';
  import Pic from './Pic.svelte';
  import { reseau } from './reseau.svelte.ts';

  /** Paiement de démonstration : récapitulatif, moyen de paiement (carte de test, wallet, mobile money), règles de finalisation J-1. Rien n'est conservé ; le résultat du « prestataire » est simulé. */
  let { offreId = '' }: { offreId?: string } = $props();
  const t0 = maintenant();
  const compte = $derived(compteCourant());
  const offre = $derived(compte ? trouverOffre(offreId, compte.pass.actif) : undefined);
  const vol = $derived(offre ? volDe(offre.volId) : undefined);
  const ch = $derived(vol ? chronologie(vol, t0) : undefined);
  const obstacle = $derived(offre && compte ? obstacleAchat(offre, compte.id) : null);
  const total = $derived(offre ? totalAPayer(offre.prix) : 0);

  let moyen = $state<ChoixMoyen>('carte');
  let numero = $state(''), exp = $state(''), cvc = $state(''), nom = $state(''), mobile = $state('');
  let consent = $state(false), erreurConsent = $state(false), tente = $state(false);
  let touche = $state<Record<string, boolean>>({});
  let phase = $state<'saisie' | 'traitement' | 'reussi'>('saisie'), refus = $state('');
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(minuteur));

  const eNumero = $derived(erreurNumero(numero)), eExp = $derived(erreurExpiration(exp, t0)), eCvc = $derived(erreurCvc(cvc)), eNom = $derived(erreurNom(nom)), eMobile = $derived(erreurMobile(mobile));
  const voir = (k: string, e: string, vif = false) => (tente || touche[k] || vif) && e ? e : '';
  const msgNumero = $derived(voir('numero', eNumero)), msgExp = $derived(voir('exp', eExp, eExp.startsWith('Mois'))), msgCvc = $derived(voir('cvc', eCvc)), msgNom = $derived(voir('nom', eNom)), msgMobile = $derived(voir('mobile', eMobile));
  const marquer = (k: string) => () => (touche[k] = true);
  const fermee = $derived(!!ch && !ch.ouvert);

  function premierInvalide(): string | null {
    if (moyen === 'carte') { if (eNumero) return 'cc-num'; if (eExp) return 'cc-exp'; if (eCvc) return 'cc-cvc'; if (eNom) return 'cc-name'; }
    if (moyen === 'mobile' && eMobile) return 'mm-tel';
    return null;
  }
  function soumettre(e: Event) {
    e.preventDefault(); if (phase !== 'saisie' || !compte || !offre || obstacle || fermee) return;
    tente = true; refus = '';
    if (!reseau.enLigne) return;
    const cible = premierInvalide();
    if (cible) { document.getElementById(cible)?.focus(); }
    if (!consent) { erreurConsent = true; if (!cible) document.getElementById('consent')?.focus(); }
    if (cible || !consent) return;
    phase = 'traitement';
    minuteur = setTimeout(() => { // le « prestataire » répond
      const r = payer(offreId, compte.id, moyen, { numero, mobile });
      if (r.ok) { numero = exp = cvc = nom = mobile = ''; /* rien ne survit au paiement réussi */ phase = 'reussi'; aller(`/confirmation/${encodeURIComponent(r.droit.id)}`, { remplacer: true }); return; }
      phase = 'saisie'; refus = r.message;
    }, DELAI_TRAITEMENT_MS);
  }
  const choisir = (m: ChoixMoyen) => { moyen = m; refus = ''; };
  const libelleBouton = $derived(`Payer ${fmt(total)} (démo)`);
</script>

<Ecran titre="Paiement" face="jour">
  {#if !offreId}
    <!-- l'application réinstancie brièvement l'ancien écran au changement de route : rien à montrer -->
  {:else if phase === 'reussi'}
    <p class="t-sec" role="status">Paiement accepté. Ouverture de la confirmation…</p>
  {:else if !offre || !vol || !compte}
    <div class="carte vide" role="alert"><span class="ico"><Icone nom="alerte" taille={26} /></span><p class="t-section">Offre indisponible</p>
      <p class="t-sec">Cette offre n’est plus disponible : le billet vient d’être vendu ou retiré. Aucun paiement n’a été effectué.</p>
      <a class="btn" href="/rechercher" onclick={(e) => naviguer(e, '/rechercher')}>Voir d’autres offres</a></div>
  {:else}
    <div class="demo" role="note"><Icone nom="info" taille={18} trait={2} />MODE DÉMO — aucun paiement réel</div>

    <section aria-labelledby="recap-t" class="bloc">
      <h2 id="recap-t" class="sur">Récapitulatif</h2>
      <div class="recap">
        <div class="vol">
          <div class="vol-t"><span class="route">{vol.de} → {vol.vers}</span><span class="t-sec">{jourCourt(ch!.depart)} · {heure(ch!.depart)} · {compagnieDe(vol).nom} {vol.numero.split(' ')[1]}</span></div>
          <span class="type">{libelleTypeOffre(offre.type)}</span>
        </div>
        <dl class="lignes">
          <div><dt>Billet (droit de voyage)</dt><dd class="mono">{fmt(offre.prix)}</dd></div>
          <div><dt>Frais de service <span class="hyp">hypothèse</span></dt><dd class="mono">{fmt(FRAIS_SERVICE)}</dd></div>
        </dl>
        <div class="total"><span>Total</span><span class="mono grand">{fmt(total)}</span></div>
      </div>
    </section>

    <form id="form-paiement" class="col g20" onsubmit={soumettre} novalidate aria-label="Paiement">
      <fieldset class="moyens">
        <legend class="sur">Moyen de paiement</legend>
        <div class="liste">
          <label class="tuile" for="pm-card"><input id="pm-card" type="radio" name="pm" value="carte" checked={moyen === 'carte'} onchange={() => choisir('carte')} /><Icone nom="carteok" taille={22} /><span class="tx"><span class="t1">Carte</span><span class="t2">Crédit ou débit</span></span></label>
          <label class="tuile" for="pm-wallet"><input id="pm-wallet" type="radio" name="pm" value="wallet" checked={moyen === 'wallet'} onchange={() => choisir('wallet')} /><Icone nom="portefeuille" taille={22} /><span class="tx"><span class="t1">Wallet du téléphone</span><span class="t2">Choisissez une carte déjà enregistrée dans le wallet de votre téléphone</span></span></label>
          <label class="tuile" for="pm-mobile"><input id="pm-mobile" type="radio" name="pm" value="mobile" checked={moyen === 'mobile'} onchange={() => choisir('mobile')} /><Icone nom="telephone" taille={22} /><span class="tx"><span class="t1">Mobile money (selon la région)</span><span class="t2">Numéro de téléphone, confirmation par code — selon votre pays</span></span></label>
        </div>
      </fieldset>

      <div aria-live="polite" class="col g20">
      {#if moyen === 'carte'}
        <section aria-label="Carte de test" class="col g14">
          <div class="champ" data-erreur={msgNumero ? '' : undefined}>
            <label for="cc-num">Numéro de carte</label>
            <div class="avec-tag"><input id="cc-num" class="mono" type="text" inputmode="numeric" autocomplete="off" placeholder={CARTE_DE_TEST} value={numero} oninput={(e) => { numero = formaterNumero(e.currentTarget.value); e.currentTarget.value = numero; }} onblur={marquer('numero')} aria-invalid={msgNumero ? 'true' : undefined} aria-describedby={msgNumero ? 'cc-num-e' : 'cc-num-a'} /><span class="tag" aria-hidden="true">TEST</span></div>
            {#if msgNumero}<span class="erreur" id="cc-num-e" role="alert"><Icone nom="alerte" taille={16} />{msgNumero}</span>{:else}<span class="aide" id="cc-num-a">{CARTE_DE_TEST} — carte de test</span>{/if}
          </div>
          <div class="duo">
            <div class="champ" data-erreur={msgExp ? '' : undefined}>
              <label for="cc-exp">Expiration (MM/AA)</label>
              <input id="cc-exp" class="mono" type="text" inputmode="numeric" autocomplete="off" placeholder="MM/AA" maxlength="5" value={exp} oninput={(e) => { exp = formaterExpiration(e.currentTarget.value); e.currentTarget.value = exp; }} onblur={marquer('exp')} aria-invalid={msgExp ? 'true' : undefined} aria-describedby={msgExp ? 'cc-exp-e' : undefined} />
              {#if msgExp}<span class="erreur" id="cc-exp-e" role="alert"><Icone nom="alerte" taille={16} />{msgExp}</span>{/if}
            </div>
            <div class="champ" data-erreur={msgCvc ? '' : undefined}>
              <label for="cc-cvc">Code de sécurité</label>
              <input id="cc-cvc" class="mono" type="text" inputmode="numeric" autocomplete="off" placeholder="123" maxlength="3" value={cvc} oninput={(e) => { cvc = e.currentTarget.value.replace(/\D/g, '').slice(0, 3); e.currentTarget.value = cvc; }} onblur={marquer('cvc')} aria-invalid={msgCvc ? 'true' : undefined} aria-describedby={msgCvc ? 'cc-cvc-e' : undefined} />
              {#if msgCvc}<span class="erreur" id="cc-cvc-e" role="alert"><Icone nom="alerte" taille={16} />{msgCvc}</span>{/if}
            </div>
          </div>
          <div class="champ" data-erreur={msgNom ? '' : undefined}>
            <label for="cc-name">Nom sur la carte</label>
            <input id="cc-name" type="text" autocomplete="off" placeholder="ALEX T. (TEST)" bind:value={nom} onblur={marquer('nom')} aria-invalid={msgNom ? 'true' : undefined} aria-describedby={msgNom ? 'cc-name-e' : undefined} />
            {#if msgNom}<span class="erreur" id="cc-name-e" role="alert"><Icone nom="alerte" taille={16} />{msgNom}</span>{/if}
          </div>
        </section>
      {:else if moyen === 'wallet'}
        <div class="note"><span class="bleu"><Icone nom="portefeuille" taille={22} /></span><p>Vous choisirez une carte déjà enregistrée dans le wallet de votre téléphone, puis confirmerez sur l’appareil. En démo, aucune fenêtre réelle ne s’ouvre.</p></div>
      {:else}
        <section aria-label="Mobile money" class="col g14">
          <div class="champ" data-erreur={msgMobile ? '' : undefined}>
            <label for="mm-tel">Numéro de téléphone (mobile money)</label>
            <input id="mm-tel" class="mono" type="tel" inputmode="tel" autocomplete="off" placeholder="+1 514 555 0142" bind:value={mobile} onblur={marquer('mobile')} aria-invalid={msgMobile ? 'true' : undefined} aria-describedby={msgMobile ? 'mm-tel-e' : 'mm-tel-a'} />
            {#if msgMobile}<span class="erreur" id="mm-tel-e" role="alert"><Icone nom="alerte" taille={16} />{msgMobile}</span>{:else}<span class="aide" id="mm-tel-a">Numéro fictif. Le compte mobile money doit être à votre nom.</span>{/if}
          </div>
          <div class="note"><span class="bleu"><Icone nom="telephone" taille={22} /></span><p>Un code de confirmation vous sera envoyé par message sur ce numéro. Disponible selon votre pays et votre opérateur. En démo, aucun code réel n’est envoyé.</p></div>
        </section>
      {/if}
      </div>

      <div class="col g8">
        <label class="consent" class:err={erreurConsent} for="consent"><input id="consent" type="checkbox" bind:checked={consent} onchange={() => (erreurConsent = false)} aria-describedby="consent-aide{erreurConsent ? ' consent-e' : ''}" aria-invalid={erreurConsent ? 'true' : undefined} />
          <span class="col g4"><span class="t1">J’accepte les règles de revente et de finalisation (J-1)</span><span class="t-sec" id="consent-aide">Vous devrez nommer le voyageur au plus tard le {jourCourt(ch!.echeance)} à {heure(ch!.echeance)}.</span></span></label>
        {#if erreurConsent}<p class="erreur" id="consent-e" role="alert"><Icone nom="alerte" taille={16} />Cochez cette case pour continuer.</p>{/if}
      </div>

      <p class="secu"><span class="vert"><Pic nom="bouclier" taille={18} /></span>Paiement traité par un prestataire certifié. NexG-TT ne conserve pas votre carte.</p>
    </form>
  {/if}

  {#snippet pied()}
    {#if offre && vol && compte && phase !== 'reussi'}
      {#if !reseau.enLigne}<p class="alerte" role="alert"><Icone nom="hors_ligne" taille={18} />Vous êtes hors ligne : le paiement attend le retour du réseau.</p>{/if}
      {#if refus}<p class="alerte" role="alert"><Icone nom="alerte" taille={18} />{refus}</p>{/if}
      {#if obstacle}<p class="alerte" role="alert"><Icone nom="alerte" taille={18} />{obstacle}</p>{/if}
      {#if fermee}<p class="alerte" role="alert"><Icone nom="alerte" taille={18} />L’échéance de ce vol est passée : plus aucune transaction n’est possible.</p>{/if}
      <p class="sr" role="status">{phase === 'traitement' ? 'Traitement du paiement en cours.' : ''}</p>
      <button class="btn" type="submit" form="form-paiement" aria-disabled={!reseau.enLigne || phase === 'traitement' || !!obstacle || fermee ? 'true' : undefined} aria-busy={phase === 'traitement' ? 'true' : undefined}>
        {#if phase === 'traitement'}<span class="rond-att" aria-hidden="true"></span>Traitement du paiement…{:else}<Icone nom="cadenas" taille={18} trait={2} />Payer <span class="mono">{fmt(total)}</span> (démo){/if}
      </button>
    {/if}
  {/snippet}
</Ecran>

<style>
  .demo { display: flex; align-items: center; gap: 8px; background: rgba(26, 100, 200, 0.1); border: 1px solid rgba(26, 100, 200, 0.4); color: var(--accent-2); border-radius: 12px; padding: 10px 12px; font: 600 13px/18px 'Barlow', sans-serif; }
  .bloc { display: flex; flex-direction: column; gap: 10px; }
  .sur { margin: 0; padding: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .recap { border-radius: 20px; background: var(--surface); border: 1px solid var(--line); overflow: hidden; }
  .vol { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
  .vol-t { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .route { font: 700 28px/30px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .type { flex: none; display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .lignes { margin: 0; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
  .lignes > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  dt { display: flex; align-items: center; gap: 8px; font-size: 15px; color: var(--ink2); flex-wrap: wrap; }
  dd { margin: 0; font-size: 15px; font-variant-numeric: tabular-nums; }
  .hyp { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; background: var(--surface2); color: var(--ink2); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.04em; }
  .total { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px 16px; border-top: 1px dashed var(--line-strong); font: 700 16px/20px 'Barlow', sans-serif; }
  .grand { font-weight: 600; font-size: 26px; line-height: 30px; font-variant-numeric: tabular-nums; }
  .moyens { margin: 0; padding: 0; border: 0; min-width: 0; }
  .moyens legend { padding: 0; margin: 0 0 10px; }
  .liste { display: flex; flex-direction: column; gap: 8px; }
  .tuile { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 8px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); cursor: pointer; color: var(--ink2); }
  .tuile:has(input:checked) { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .tuile:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
  .tuile input { width: 20px; height: 20px; margin: 0; accent-color: var(--accent); flex: none; cursor: pointer; }
  .tx { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .t1 { font: 600 15px/20px 'Barlow', sans-serif; color: var(--ink); }
  .t2 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); }
  .g14 { gap: 14px; }
  .avec-tag { position: relative; }
  .avec-tag input { width: 100%; padding-right: 64px; }
  .tag { position: absolute; right: 12px; top: 14px; height: 24px; padding: 0 8px; display: flex; align-items: center; border-radius: 6px; background: var(--surface2); color: var(--ink2); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.08em; }
  .duo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: start; }
  .champ input { width: 100%; min-width: 0; }
  .champ .mono { font-variant-numeric: tabular-nums; }
  .note { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .note p { font-size: 14px; line-height: 20px; color: var(--ink2); }
  .bleu { color: var(--accent); display: flex; }
  .consent { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; padding: 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); cursor: pointer; }
  .consent.err { border: 2px solid var(--err); padding: 13px; }
  .consent input { width: 22px; height: 22px; margin: 1px 0 0; accent-color: var(--accent); flex: none; cursor: pointer; }
  .erreur { display: flex; gap: 6px; align-items: flex-start; font: 500 13px/18px 'Barlow', sans-serif; color: var(--err); }
  .secu { display: flex; align-items: flex-start; gap: 10px; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .vert { color: var(--ok); display: flex; }
  .alerte { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 600 13px/18px 'Barlow', sans-serif; }
  .vide { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; padding: 20px; }
  .ico { width: 48px; height: 48px; border-radius: 999px; display: grid; place-items: center; background: var(--err-soft); color: var(--err); }
  .vide .t-section { text-transform: uppercase; letter-spacing: 0.02em; }
  .rond-att { width: 16px; height: 16px; border-radius: 999px; border: 2px solid currentColor; border-right-color: transparent; animation: tourne 0.8s linear infinite; }
  @keyframes tourne { to { transform: rotate(360deg); } }
</style>
