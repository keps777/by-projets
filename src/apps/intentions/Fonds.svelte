<script lang="ts">
  import { onMount } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import { ecran } from '../achat/ecranPc.svelte.ts';
  import Picto from '../bagages/Picto.svelte';
  import { aller } from '../../router.svelte.ts';
  import { jourDe, maintenant } from '../../data/store.svelte.ts';
  import { arrondi, fmt } from '../../core/argent.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { reseau } from '../profil/enligne.svelte.ts';
  import { creerIntention } from './actions.ts';
  import { totalReserve, villeDe } from './compat.ts';
  import { expirationDe, lire, type SourceFonds } from './modele.ts';
  import { nomAnonyme } from './vues.ts';
  import { fenetre, jourMois, pluriel } from './temps.ts';

  /** Réserver les fonds (planche m3-24) : le montant maximum est mis de côté sur la carte ou le solde, aucun débit sans accord. Crée l'intention. */
  const compte = $derived(compteCourant());
  const b = $derived(lire().brouillon);
  const montant = $derived(b ? totalReserve(b) : 0);
  const expire = $derived(b ? expirationDe(b.validite, b.du, maintenant()) : 0);
  const jourExpire = $derived(jourMois(jourDe(expire)));
  const manque = $derived(compte ? arrondi(Math.max(0, montant - compte.solde)) : montant);
  const aCarte = $derived(!!compte?.carte4);
  let choix = $state<SourceFonds | null>(null);
  const source = $derived<SourceFonds>(choix ?? (aCarte ? 'carte' : 'wallet'));
  let consent = $state(false), erreurConsent = $state(false), erreur = $state(''), envoi = $state(false);
  const id = $derived(nomAnonyme(compte));

  onMount(() => { if (!lire().brouillon && location.pathname === '/intention/fonds') aller('/intention/nouvelle', { remplacer: true }); });

  const validite = $derived(b?.validite === '7' ? '7 jours' : b?.validite === '30' ? '30 jours' : 'jusqu’à J-3');
  const options = $derived(b ? [b.auto ? `Accord automatique ≤ ${fmt(b.budget)}` : 'Validation à la main', b.auDessus ? 'propositions au-dessus acceptées' : 'propositions au-dessus ignorées', b.anonyme ? `anonyme « ${id.initiale} »` : `nom visible « ${id.nom} »`].join(' · ') : '');
  const aideSource = $derived(source === 'carte' ? `Une pré-autorisation de ${fmt(montant)} apparaît sur votre carte sans être débitée. Si elle arrive à échéance avant la fin de votre intention, nous vous demanderons de la renouveler.` : source === 'solde' ? `${fmt(montant)} sont mis de côté sur votre solde NexG, sans être dépensés. Ils reviennent au solde à l’expiration ou au retrait.` : 'Vous confirmerez la réservation sur votre appareil. En démo, aucune fenêtre réelle ne s’ouvre.');

  async function confirmer() {
    if (!compte || !b || envoi) return;
    if (!consent) { erreurConsent = true; document.getElementById('consent')?.focus(); return; }
    if (!reseau.enLigne) { erreur = 'Vous êtes hors ligne : la réservation reprendra dès que la connexion revient.'; return; }
    envoi = true; erreur = '';
    await new Promise((r) => setTimeout(r, 400)); // le prestataire de paiement répond (démo)
    try { creerIntention(compte.id, b, source); aller('/intentions', { remplacer: true }); }
    catch (e) { erreur = e instanceof Error ? e.message : 'La réservation n’a pas pu être traitée. Réessayez.'; }
    finally { envoi = false; }
  }
</script>

{#snippet pied()}
    {#if b && compte}
      {#if erreur}<p class="err sur-pied" role="alert"><Picto nom="alerte" taille={16} />{erreur}</p>{/if}
      <button type="button" class="btn" disabled={envoi} aria-describedby="cta-help" onclick={confirmer}><Picto nom="reserve" taille={20} />{envoi ? 'Réservation en cours…' : 'Confirmer la réservation (démo)'}</button>
      <p id="cta-help" class="cta-help">Aucun débit tant qu’aucun billet n’est accepté.</p>
    {/if}
  {/snippet}

<Ecran titre="Réserver les fonds" face="jour" retour="/intention/nouvelle" large pied={ecran.pc ? undefined : pied}>
<div class="pc-col">
  <h1 class="sr">Réserver les fonds</h1>
  {#if !b || !compte}
    <section class="carte vide"><h2 class="t-section">Aucune intention à réserver</h2><p class="t-sec">Dites d’abord votre prix : les fonds se réservent à la dernière étape.</p><button type="button" class="btn" onclick={() => aller('/intention/nouvelle')}>Dire mon prix</button></section>
  {:else}
    <div class="demo" role="note"><Picto nom="info" taille={16} />MODE DÉMO — aucun paiement réel</div>

    <section class="montant" aria-label="Fonds réservés">
      <div class="ligne"><span class="ico" aria-hidden="true"><Picto nom="reserve" taille={28} trait={1.75} /></span>
        <div class="col g2"><span class="sur">Montant réservé</span><span class="mono grand">{fmt(montant)}</span></div></div>
      <p class="p15"><strong>Non débité.</strong> <span class="gris">Libéré automatiquement le {jourExpire} {new Date(expire).getFullYear()} si aucun accord.</span></p>
      <ol class="issues" aria-label="Ce qui peut arriver">
        <li class="vert"><span class="tt"><Picto nom="ok" taille={16} trait={2.25} />Accord</span><span class="tx">Le prix convenu est pris sur la réserve. Le reste est libéré.</span></li>
        <li><span class="tt gris2"><Picto nom="horloge" taille={16} />Expiration</span><span class="tx">Tout est libéré le {jourExpire} Rien n’est prélevé, aucun frais.</span></li>
      </ol>
    </section>

    <fieldset class="sources">
      <legend class="sur">Source des fonds</legend>
      <div class="col g8">
        <label for="src-card" class="opt" class:sel={source === 'carte'} class:off={!aCarte}>
          <input id="src-card" type="radio" name="src" value="carte" checked={source === 'carte'} disabled={!aCarte} onchange={() => (choix = 'carte')} aria-describedby="src-card-h" />
          <Picto nom="carte" taille={24} trait={1.75} />
          <span class="col g1"><span class="o1">Carte <span class="mono">•••• {compte.carte4 ?? '····'}</span> (test)</span>
            <span class="o2" id="src-card-h">{aCarte ? 'Pré-autorisation, non débitée. Durée limitée selon l’émetteur.' : 'Aucune carte enregistrée.'}{#if !aCarte} <a href="/carte?retour=/intention/fonds" onclick={(e) => { e.preventDefault(); aller('/carte?retour=/intention/fonds'); }}>Ajouter une carte</a>{/if}</span></span>
        </label>
        <div class="opt" class:sel={source === 'solde'} class:off={manque > 0}>
          <input id="src-balance" type="radio" name="src" value="solde" checked={source === 'solde'} disabled={manque > 0} aria-describedby="src-balance-why" onchange={() => (choix = 'solde')} />
          <Picto nom="portefeuille" taille={24} trait={1.75} />
          <span class="col g2"><label for="src-balance" class="o1 sans-curseur">Solde NexG · <span class="mono">{fmt(compte.solde)}</span> disponibles</label>
            <span id="src-balance-why" class="o2 info">{#if manque > 0}<Picto nom="info" taille={16} />Insuffisant : il manque <span class="mono fort">{fmt(manque)}</span>{:else}Suffisant : {fmt(montant)} mis de côté, non dépensés.{/if}</span></span>
        </div>
        <label for="src-wallet" class="opt" class:sel={source === 'wallet'}>
          <input id="src-wallet" type="radio" name="src" value="wallet" checked={source === 'wallet'} onchange={() => (choix = 'wallet')} />
          <Picto nom="mobile" taille={24} trait={1.75} />
          <span class="col g1"><span class="o1">Wallet du téléphone</span><span class="o2">Une carte déjà enregistrée dans le wallet de votre téléphone</span></span>
        </label>
      </div>
      <p class="aide" aria-live="polite">{aideSource}</p>
    </fieldset>

    <section class="col g10" aria-labelledby="recap-title"><h2 id="recap-title" class="sur">Votre intention</h2>
      <div class="recap">
        <div class="r-haut"><div class="col g2 grow"><span class="trj">{b.de} → {b.vers}</span><span class="t-sec">{villeDe(b.de)} → {villeDe(b.vers)} · {b.aller === 'simple' ? 'aller simple' : 'aller-retour'} · {pluriel(b.voyageurs, 'voyageur')}</span></div><span class="ch">Intention</span></div>
        <dl class="dl">
          <div><dt>Fenêtre de départ</dt><dd>Du {fenetre(b.du, b.au).replace(/ \d{4}$/, '').replace('–', ' au ')} · {b.flexible ? 'flexible' : 'dates exactes'}</dd></div>
          <div><dt>Prix maximum</dt><dd class="mono">{fmt(b.budget)}{b.voyageurs > 1 ? ` × ${b.voyageurs}` : ''}</dd></div>
          <div><dt>Validité</dt><dd>{validite} · jusqu’au {jourExpire}</dd></div>
          <div class="haut"><dt>Options</dt><dd class="opts">{options}</dd></div>
        </dl>
        <div class="r-bas"><span class="rt">Réservé aujourd’hui</span><span class="col dr"><span class="mono tot">{fmt(montant)}</span><span class="zero">Débité aujourd’hui&nbsp;: 0&nbsp;$</span></span></div>
      </div>
    </section>

    <div class="col g8">
      <label for="consent" class="consent" class:bad={erreurConsent}>
        <input id="consent" type="checkbox" bind:checked={consent} onchange={() => (erreurConsent = false)} aria-describedby="consent-help" aria-invalid={erreurConsent ? 'true' : undefined} />
        <span class="col g4"><span class="o1">Je comprends que les fonds sont réservés jusqu’à l’accord ou l’expiration</span><span class="o2" id="consent-help">Vous pouvez retirer votre intention à tout moment avant un accord : les fonds sont alors libérés.</span></span>
      </label>
      {#if erreurConsent}<p class="err" role="alert"><Picto nom="info" taille={16} />Cochez cette case pour réserver les fonds.</p>{/if}
    </div>
    <p class="secu"><Picto nom="bouclier" taille={18} trait={1.75} /><span>Réservation traitée par un prestataire de paiement certifié. NexG-TT ne conserve pas votre carte. <span class="hyp">Hypothèse</span> cadre de la réservation de fonds à valider.</span></p>
  {/if}
{#if ecran.pc}{@render pied()}{/if}
</div>
</Ecran>

<style>
  .vide { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .demo { display: flex; align-items: center; gap: 8px; background: rgba(26, 100, 200, 0.1); border: 1px solid rgba(26, 100, 200, 0.4); color: #124c9c; border-radius: 12px; padding: 10px 12px; font: 600 13px/18px 'Barlow', sans-serif; margin-bottom: -8px; }
  .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #3e4f66; margin: 0; }
  .montant { display: flex; flex-direction: column; gap: 14px; padding: 20px 18px 18px; border-radius: 20px; background: #fff; box-shadow: 0 1px 0 #d3dce6, 0 12px 32px rgba(11, 27, 46, 0.1); }
  .ligne { display: flex; align-items: center; gap: 14px; } .ico { flex: none; width: 56px; height: 56px; border-radius: 16px; background: rgba(26, 100, 200, 0.1); color: #1a64c8; display: grid; place-items: center; }
  .grand { font: 600 clamp(32px, 10.2vw, 40px)/44px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .p15 { margin: 0; font: 400 15px/22px 'Barlow', sans-serif; } .p15 strong { font-weight: 600; } .gris { color: #3e4f66; }
  .issues { list-style: none; margin: 0; padding: 12px 0 0; border-top: 1px dashed #b9c5d3; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .issues li { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 14px; background: #eef3f8; min-width: 0; } .issues li.vert { background: rgba(11, 122, 85, 0.1); }
  .tt { display: flex; align-items: center; gap: 6px; color: #0b7a55; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; } .tt.gris2 { color: #3e4f66; } .tx { font: 400 13px/18px 'Barlow', sans-serif; color: #0b1b2e; }
  .sources { margin: 0; padding: 0; border: 0; min-width: 0; } .sources legend { padding: 0; margin: 0 0 10px; }
  .opt { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 14px; box-sizing: border-box; border-radius: 14px; background: #fff; border: 1px solid #d3dce6; cursor: pointer; } .opt.sel { border: 2px solid #1a64c8; padding: 9px 13px; } .opt.off { background: #e3eaf2; cursor: default; }
  .opt input { width: 20px; height: 20px; margin: 0; accent-color: #1a64c8; flex: none; cursor: pointer; } .opt input:disabled { cursor: not-allowed; } .opt > :global(svg) { color: #3e4f66; }
  .col.g1 { gap: 1px; } .col.g2 { gap: 2px; } .col.g4 { gap: 4px; } .col.g8 { gap: 8px; } .col.g10 { gap: 10px; }
  .o1 { font: 600 15px/20px 'Barlow', sans-serif; } .off .o1 { color: #3e4f66; } .sans-curseur { cursor: default; } .o2 { font: 400 13px/18px 'Barlow', sans-serif; color: #5e6e84; } .o2.info { display: flex; align-items: center; gap: 6px; font-weight: 500; color: #3e4f66; flex-wrap: wrap; } .fort { font-weight: 600; } .o2 a { font-weight: 600; }
  .aide { margin: 10px 0 0; font: 400 13px/18px 'Barlow', sans-serif; color: #5e6e84; }
  .recap { border-radius: 20px; background: #fff; border: 1px solid #d3dce6; overflow: hidden; } .r-haut { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #d3dce6; }
  .trj { font: 700 28px/30px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .ch { flex: none; display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: rgba(26, 100, 200, 0.1); color: #1a64c8; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .dl { margin: 0; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; } .dl div { display: flex; align-items: center; justify-content: space-between; gap: 12px; } .dl div.haut { align-items: flex-start; } .dl dt { font: 400 15px/20px 'Barlow', sans-serif; color: #3e4f66; flex: none; } .dl dd { margin: 0; font: 600 15px/20px 'Barlow', sans-serif; text-align: right; } .dl dd.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .dl dd.opts { font: 400 14px/20px 'Barlow', sans-serif; color: #0b1b2e; }
  .r-bas { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px 16px; border-top: 1px dashed #b9c5d3; } .rt { font: 700 16px/22px 'Barlow', sans-serif; } .dr { align-items: flex-end; } .tot { font: 600 26px/30px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .zero { font: 600 13px/18px 'Barlow', sans-serif; color: #0b7a55; }
  .consent { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; padding: 14px; box-sizing: border-box; border-radius: 14px; background: #fff; border: 1px solid #d3dce6; cursor: pointer; } .consent.bad { border: 2px solid #c2362f; padding: 13px; } .consent input { width: 22px; height: 22px; margin: 1px 0 0; accent-color: #1a64c8; flex: none; cursor: pointer; }
  .err { margin: 0; display: flex; align-items: center; gap: 6px; font: 500 13px/18px 'Barlow', sans-serif; color: #c2362f; } .sur-pied { background: #fff; padding: 6px 8px; border-radius: 10px; }
  .secu { margin: 0; display: flex; align-items: flex-start; gap: 10px; font: 400 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .hyp { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; background: #e3eaf2; color: #3e4f66; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.04em; vertical-align: middle; }
  .cta-help { margin: 0; text-align: center; font: 400 12px/16px 'Barlow', sans-serif; color: #5e6e84; }
  @media (max-width: 359px) { .issues { grid-template-columns: 1fr; } }
  /* PC (≥ 900 px) : pas de planche ; colonne centrée de 640 px au plus (la barre d'action suit le contenu). */
  .pc-col { display: contents; }
  @media (min-width: 900px) { .pc-col { display: flex; flex-direction: column; gap: 20px; width: 100%; max-width: 640px; margin-inline: auto; } }
</style>
