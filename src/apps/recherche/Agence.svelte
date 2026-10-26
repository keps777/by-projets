<script lang="ts">
  import { tick } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import { dollars } from './montants.ts';
  import { app } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe } from '../../domain/marche.ts';
  import { aLePass, envoyerMessageAgence, offresDeAgence } from './actions.ts';
  import { PERMIS_EXEMPLE, SUFFIXE_EXEMPLE, messageForfait, monogramme, specialitesTexte, zonesDe } from './agence.ts';
  import { fmtEscales, fmtJourAnnee, fmtMoisAnnee, jourValide } from './dates.ts';
  import { lienOffre, va } from './nav.ts';
  import { fmtEcart } from './offres.ts';
  import Pictos from './Pictos.svelte';
  import { reseau } from './reseau.svelte.ts';

  /** Vitrine d'une agence partenaire : identité vérifiée, message à un conseiller (démo), ses offres (billets vendus « par » l'agence) et « À propos ». */
  let { agenceId }: { agenceId: string } = $props();
  const agence = $derived(app.monde.agences.find((a) => a.id === agenceId));
  const compte = $derived(compteCourant());
  const lignes = $derived(agence ? offresDeAgence(agence.id, aLePass(compte?.id)) : []);
  const ville = (code: string) => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
  const zones = $derived(agence ? zonesDe(app.monde.offresAgence.filter((o) => o.agenceId === agence.id), app.monde.vols, app.monde.aeroports) : []);
  let onglet = $state<'offres' | 'apropos'>('offres'), ouvert = $state(false), message = $state(''), erreur = $state(''), envoye = $state(false);
  const depuis = $derived(agence ? fmtMoisAnnee(new Date(agence.depuis).toISOString().slice(0, 10)) : '');

  async function ecrire(texte = '') {
    envoye = false; erreur = ''; ouvert = true; if (texte) message = texte;
    await tick(); document.getElementById('ag-msg')?.focus();
  }
  function fermer() { ouvert = false; erreur = ''; }
  function envoyer() {
    if (!agence) return;
    if (!reseau.enLigne) { erreur = 'Vous êtes hors ligne : le message partira au retour du réseau. Réessayez alors.'; return; }
    const r = envoyerMessageAgence(compte?.id, agence, message);
    if (r.ok) { ouvert = false; message = ''; erreur = ''; envoye = true; }
    else { erreur = r.raison === 'vide' ? 'Écrivez votre message avant de l’envoyer.' : 'Connectez-vous pour écrire à un conseiller.'; void tick().then(() => document.getElementById('ag-msg')?.focus()); }
  }
  const ONGLETS = [{ id: 'offres' as const, lib: () => `Offres · ${lignes.length}` }, { id: 'apropos' as const, lib: () => 'À propos' }];
  function toucheOnglet(e: KeyboardEvent) {
    const i = ONGLETS.findIndex((o) => o.id === onglet); let j = i;
    if (e.key === 'ArrowRight') j = (i + 1) % ONGLETS.length; else if (e.key === 'ArrowLeft') j = (i + ONGLETS.length - 1) % ONGLETS.length; else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = ONGLETS.length - 1; else return;
    e.preventDefault(); onglet = ONGLETS[j].id; void tick().then(() => document.getElementById(`tab-${ONGLETS[j].id}`)?.focus());
  }
</script>

<Ecran titre="Vitrine agence" face="jour">
  {#if !agence}
    <section class="bloc"><p class="alerte" role="alert"><Pictos nom="alerte" taille={20} /><span><strong>Agence introuvable</strong><br />Cette vitrine n’existe pas ou n’est plus publiée.</span></p>
      <a class="btn" href="/rechercher" onclick={(e) => va(e, '/rechercher')}>Rechercher un vol</a></section>
  {:else}
    <section aria-labelledby="ag-name" class="bloc entete">
      <div class="id">
        <span role="img" aria-label="Monogramme {monogramme(agence.nom)}, emplacement du logo" class="mono-g">{monogramme(agence.nom)}</span>
        <div class="col g8"><h1 id="ag-name">{agence.nom} <span class="ex">{SUFFIXE_EXEMPLE}</span></h1>
          {#if agence.permisVerifie}<span class="puce ready"><Pictos nom="bouclier" taille={14} trait={2.25} />Agence partenaire vérifiée</span>{:else}<span class="puce"><Pictos nom="info" taille={14} trait={2} />Vérification en cours</span>{/if}</div>
      </div>
      <p class="vendu"><Pictos nom="agence" taille={18} />Vendu par {agence.nom} via NexG-TT</p>
      {#if agence.offresForfait}<p class="forfait"><Pictos nom="etiquette" taille={18} />{agence.offresForfait}<button type="button" class="lien" onclick={() => ecrire(messageForfait(agence))}>Demander un forfait</button></p>{/if}
      <button type="button" class="btn sec" aria-expanded={ouvert} aria-controls="ag-compose" onclick={() => (ouvert ? fermer() : ecrire())}><Pictos nom="message" taille={20} />Écrire à un conseiller</button>
      {#if ouvert}
        <div id="ag-compose" class="compose">
          <label for="ag-msg">Votre message à {agence.nom}</label>
          <textarea id="ag-msg" rows="4" bind:value={message} oninput={() => (erreur = '')} placeholder="Bonjour, je cherche un séjour en mars pour deux personnes…" aria-invalid={erreur ? 'true' : undefined} aria-describedby={erreur ? 'ag-msg-e ag-msg-help' : 'ag-msg-help'}></textarea>
          {#if erreur}<span class="erreur" id="ag-msg-e" role="alert"><Pictos nom="alerte" taille={16} />{erreur}{#if erreur.startsWith('Connectez')} <a href="/connexion" onclick={(e) => va(e, '/connexion')}>Se connecter</a>{/if}</span>{/if}
          <span id="ag-msg-help" class="aide">Ne partagez ni numéro de carte ni mot de passe.</span>
          <div class="deux"><button type="button" class="btn sec sm" onclick={fermer}>Annuler</button><button type="button" class="btn sm" onclick={envoyer}>Envoyer (démo)</button></div>
        </div>
      {/if}
      <div role="status" aria-live="polite">{#if envoye}<p class="ok"><Pictos nom="ok" taille={18} trait={2.25} />Message envoyé (démo). La réponse arrivera dans vos notifications NexG-TT.</p>{/if}</div>
    </section>

    <div role="tablist" aria-label="Contenu de la vitrine" class="onglets" tabindex="-1" onkeydown={toucheOnglet}>
      {#each ONGLETS as o (o.id)}
        <button type="button" role="tab" id="tab-{o.id}" aria-selected={onglet === o.id} aria-controls="panel-{o.id}" tabindex={onglet === o.id ? 0 : -1} class:on={onglet === o.id} onclick={() => (onglet = o.id)}>{o.lib()}</button>
      {/each}
    </div>

    {#if onglet === 'offres'}
      <div role="tabpanel" id="panel-offres" aria-labelledby="tab-offres" class="panneau">
        {#if lignes.length}
          <ul class="liste-plain offres" aria-label="Offres de {agence.nom}">
            {#each lignes as { offre, vol } (offre.id)}
              <li><a class="of" href={lienOffre(offre.id)} onclick={(e) => va(e, lienOffre(offre.id))} data-offre={offre.id}>
                <span class="of-h"><span class="of-k"><span class="puce info">{vol.escales.length ? `Vol seul · ${fmtEscales(vol.escales)}` : 'Vol seul'}</span><span class="of-c">{vol.de} → {vol.vers}</span></span>
                  <span class="of-v">{ville(vol.vers)}</span><span class="of-d">Depuis {ville(vol.de)} · {vol.escales.length ? fmtEscales(vol.escales).toLowerCase() : 'vol direct'}</span><span class="of-dt">{fmtJourAnnee(vol.jour)} · {compagnieDe(vol).nom}</span></span>
                <span class="of-perfo" aria-hidden="true"><i class="g"></i><i class="d"></i></span>
                <span class="of-b"><span class="tampon"><Pictos nom="agence" taille={14} trait={2} />Vendu par {agence.nom}</span>
                  <span class="of-p"><span class="of-m">{dollars(offre.prix)}</span><span class="of-pp">par personne</span>
                    {#if offre.ecartPct !== 0}<span class="of-e" class:baisse={offre.ecartPct < 0} class:hausse={offre.ecartPct > 0}><Pictos nom={offre.ecartPct < 0 ? 'baisse' : 'hausse'} taille={13} trait={2.25} />{fmtEcart(offre.ecartPct)} vs neuf</span>{/if}</span></span>
              </a></li>
            {/each}
          </ul>
        {:else}
          <p class="vide">Aucune offre publiée pour l’instant. Écrivez à un conseiller pour demander un devis.</p>
        {/if}
        <p class="note">Prix indicatifs. Les billets achetés ici rejoignent votre portefeuille NexG-TT.</p>
      </div>
    {:else}
      <div role="tabpanel" id="panel-apropos" aria-labelledby="tab-apropos" class="panneau">
        <p class="txt">{agence.description} Elle publie ses offres sur NexG-TT ; la réservation, le paiement et le portefeuille de billets passent par NexG-TT.</p>
        <dl class="fiche">
          <div><dt>Spécialités</dt><dd>{specialitesTexte(zones)}</dd></div>
          <div><dt>Basée à</dt><dd>{agence.ville}</dd></div>
          <div><dt>Sur NexG-TT depuis</dt><dd>{depuis}</dd></div>
          <div><dt>Permis d’agent de voyages</dt><dd class="mono">{PERMIS_EXEMPLE}</dd></div>
        </dl>
        <div class="verif"><Pictos nom="bouclier" taille={22} />
          <span class="col g4"><span class="v1">Ce que « vérifiée » veut dire</span><span class="v2">NexG-TT contrôle l’identité de l’entreprise et son permis avant d’ouvrir une vitrine. Processus à définir.</span></span></div>
      </div>
    {/if}
  {/if}
</Ecran>

<style>
  .col { display: flex; flex-direction: column; } .g8 { gap: 8px; min-width: 0; } .g4 { gap: 4px; }
  .bloc { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .id { display: flex; align-items: center; gap: 14px; } .mono-g { width: 68px; height: 68px; flex: none; border-radius: 18px; background: var(--ink); color: #fff; display: grid; place-items: center; font: 700 30px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; }
  h1 { margin: 0; font: 700 32px/30px 'Barlow Condensed', 'Arial Narrow', sans-serif; } .ex { font: 500 15px/20px 'Barlow', sans-serif; color: var(--ink2); }
  .puce { align-self: flex-start; } .vendu { margin: 0; display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid var(--line); font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .vendu :global(svg) { flex: none; }
  .forfait { margin: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .forfait :global(svg) { flex: none; color: var(--ink); }
  .lien { min-height: 44px; padding: 0 4px; border: 0; background: none; color: var(--accent); font: 600 14px/1 'Barlow', sans-serif; cursor: pointer; }
  .compose { display: flex; flex-direction: column; gap: 8px; } .compose label { font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  textarea { min-height: 104px; box-sizing: border-box; padding: 12px 14px; border-radius: 12px; background: var(--surface); border: 1px solid #7a8597; color: var(--ink); font: 400 16px/22px 'Barlow', sans-serif; resize: none; } textarea[aria-invalid='true'] { border-color: var(--err); box-shadow: 0 0 0 1px var(--err); }
  .erreur { display: flex; align-items: flex-start; gap: 6px; font: 500 13px/18px 'Barlow', sans-serif; color: var(--err); } .erreur a { font-weight: 700; } .aide { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); } .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .deux .btn { width: 100%; }
  .ok { margin: 0; display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--ok-soft); color: var(--ok); font: 600 14px/20px 'Barlow', sans-serif; } .ok :global(svg) { flex: none; margin-top: 1px; }
  .onglets { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--line); } .onglets button { min-height: 48px; margin-bottom: -1px; background: none; border: 0; border-bottom: 3px solid transparent; color: var(--ink3); font: 700 15px/1 'Barlow', sans-serif; cursor: pointer; } .onglets button.on { border-bottom-color: var(--ink); color: var(--ink); }
  .panneau { display: flex; flex-direction: column; gap: 16px; } .offres { display: flex; flex-direction: column; gap: 16px; margin: 0; padding: 0; }
  .of { display: block; position: relative; border-radius: 18px; background: var(--surface); color: var(--ink); box-shadow: var(--ombre); overflow: hidden; }
  .of-h { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px 14px; } .of-k { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; } .of-c { font: 600 13px/18px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.04em; color: var(--ink2); }
  .of-v { font: 700 44px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; overflow-wrap: anywhere; } .of-d { font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .of-dt { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); }
  .of-perfo { display: block; position: relative; margin: 0 18px; border-top: 2px dashed var(--line); height: 0; } .of-perfo i { position: absolute; top: -12px; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .of-perfo .g { left: -29px; } .of-perfo .d { right: -29px; }
  .of-b { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px 16px; }
  .tampon { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: 1.5px solid var(--ink2); border-radius: 6px; transform: rotate(-3deg); color: var(--ink2); font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; }
  .of-p { display: flex; flex-direction: column; align-items: flex-end; flex: none; } .of-m { font: 600 24px/28px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; } .of-pp { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); }
  .of-e { display: inline-flex; align-items: center; gap: 3px; font: 600 12px/16px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; } .of-e.baisse { color: var(--down); } .of-e.hausse { color: var(--up); }
  .note { margin: 0; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); } .vide { margin: 0; padding: 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); font: 400 15px/22px 'Barlow', sans-serif; color: var(--ink2); }
  .txt { margin: 0; font: 400 15px/22px 'Barlow', sans-serif; } .fiche { margin: 0; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); overflow: hidden; } .fiche > div { display: flex; justify-content: space-between; gap: 16px; padding: 14px 16px; } .fiche > div + div { border-top: 1px solid var(--line); }
  dt { font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } dd { margin: 0; font: 600 14px/20px 'Barlow', sans-serif; text-align: right; } dd.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
  .verif { display: flex; gap: 12px; padding: 16px; border-radius: 16px; background: var(--ink); color: #fff; } .verif :global(svg) { flex: none; } .v1 { font: 700 15px/20px 'Barlow', sans-serif; } .v2 { font: 400 14px/20px 'Barlow', sans-serif; color: #c9d3df; }
  .alerte { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 500 14px/20px 'Barlow', sans-serif; } .alerte strong { font-weight: 700; }
</style>
