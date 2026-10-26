<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { app, jourDe, maintenant } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, volDe } from '../../domain/marche.ts';
  import { droitDuCompte, transmettreVoyageur } from './actions.ts';
  import { chronologie, phraseReste, statutVoyage, voletsEcheance } from './chrono.ts';
  import { heure, initiales, jourComplet, jourCompletCapitale, jourMoisHeure, nomCourt } from './dates.ts';
  import { ecran } from './ecranPc.svelte.ts';
  import Introuvable from './Introuvable.svelte';
  import { naviguer } from './lien.ts';
  import Pic from './Pic.svelte';
  import { reseau } from './reseau.svelte.ts';
  import { construireVoyageur, erreursVoyageur, GENRES, ligneVoyageur, procheDe, saisieDuCompte, SAISIE_VIDE, type Genre, type Qui, type SaisieVoyageur } from './voyageur.ts';

  /** Nommer le voyageur (J-1) : action définitive, transmise à la compagnie. Moi, un proche enregistré ou un nouveau voyageur, tel qu'inscrit sur le passeport. */
  let { droitId = '' }: { droitId?: string } = $props();
  let tick = $state(maintenant());
  onMount(() => { const t = setInterval(() => (tick = maintenant()), 15_000); return () => clearInterval(t); });

  const compte = $derived(compteCourant());
  const droit = $derived(droitDuCompte(droitId, compte?.id));
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const ch = $derived(vol ? chronologie(vol, tick) : undefined);
  const statut = $derived(droit ? statutVoyage(droit) : 'autre');
  const proches = $derived(compte ? procheDe(compte, app.monde.comptes) : []);
  const volets = $derived(ch ? voletsEcheance(ch.resteMs) : { jours: '00', heures: '00' });

  let qui = $state<Qui>('moi');
  let saisie = $state<SaisieVoyageur>(untrack(() => (compteCourant() ? saisieDuCompte(compteCourant()!) : { ...SAISIE_VIDE })));
  let procheId = $state<string | null>(null);
  let consent = $state(false), tente = $state(false), manqueConsent = $state(false), envoi = $state(false), termine = $state(false), erreurMarche = $state('');
  const procheChoisi = $derived(proches.find((p) => p.id === procheId));
  const erreurs = $derived(erreursVoyageur(qui, saisie, procheId, tick));
  const ligne = $derived(ligneVoyageur(qui, saisie, procheChoisi));
  const montre = <K extends keyof typeof erreurs>(k: K) => (tente ? (erreurs[k] ?? '') : '');

  function choisir(q: Qui) {
    qui = q; erreurMarche = ''; tente = false;
    if (q === 'moi' && compte) saisie = saisieDuCompte(compte); else if (q === 'nouveau') saisie = { ...SAISIE_VIDE };
  }
  const ordre = ['nom', 'prenom', 'naissance', 'document'] as const, idChamp = { nom: 'f-nom', prenom: 'f-prenom', naissance: 'f-naissance', document: 'f-doc' };
  function confirmer() {
    if (envoi || !droit || !compte || !ch?.ouvert) return;
    if (!consent) { manqueConsent = true; document.getElementById('consent')?.focus(); return; }
    tente = true; erreurMarche = '';
    if (!reseau.enLigne) return;
    if (qui === 'proche' && Object.keys(erreurs).length) { document.getElementById('proche-' + (proches[0]?.id ?? ''))?.focus(); return; }
    const premier = ordre.find((k) => erreurs[k]); if (premier) { document.getElementById(idChamp[premier])?.focus(); return; }
    envoi = true;
    const r = transmettreVoyageur(droit.id, compte.id, construireVoyageur(qui, saisie, compte, procheChoisi));
    if (r.ok) { termine = true; aller(`/pret-a-voyager/${encodeURIComponent(droit.id)}`, { remplacer: true }); }
    else { envoi = false; erreurMarche = r.message; }
  }
  const options = $derived([
    { v: 'moi' as Qui, titre: `Moi (${compte ? nomCourt(compte.prenom, compte.nom) : ''})`, sous: 'Données de votre profil, à vérifier' },
    { v: 'proche' as Qui, titre: 'Un proche enregistré', sous: 'Choisir parmi vos voyageurs' },
    { v: 'nouveau' as Qui, titre: 'Nouveau voyageur', sous: 'Saisir ses informations' }
  ]);
</script>

{#if !droitId}
  <!-- ancien écran réinstancié brièvement au changement de route : rien à montrer -->
{:else if !droit || !vol || !ch || !compte}
  <Introuvable titre="Droit introuvable" message="Ce droit de voyage n’est pas dans votre portefeuille." lien="/portefeuille" libelleLien="Voir mon portefeuille" retour="/" />
{:else if termine}
  <Ecran titre="Nommer le voyageur" face="jour" sansRetour><p class="t-sec" role="status">Voyageur transmis. Ouverture de la carte d’embarquement…</p></Ecran>
{:else if statut === 'nomme' || statut === 'parti'}
  <Ecran titre="Nommer le voyageur" face="jour" retour="/voyage/{droit.id}">
    <div class="carte col g12"><span class="puce ready"><Icone nom="ok" taille={14} trait={2.5} />Nommé — prêt</span>
      <p class="t-section">Le voyageur est déjà nommé</p>
      <p class="t-sec">{droit.voyageur ? `${droit.voyageur.prenom} ${droit.voyageur.nom}` : 'Ce billet'} a été transmis à {compagnieDe(vol).nom}. Revente et transfert sont fermés.</p>
      <a class="btn" href="/pret-a-voyager/{droit.id}" onclick={(e) => naviguer(e, `/pret-a-voyager/${droit.id}`)}>Voir la carte d’embarquement</a></div>
  </Ecran>
{:else if statut === 'autre'}
  <Introuvable titre="Droit indisponible" message="Ce droit de voyage ne peut plus être nommé : il n’est plus détenu par vous." lien="/portefeuille" libelleLien="Voir mon portefeuille" retour="/" />
{:else}
  {#snippet rebours()}
  <section class="rebours" aria-labelledby="cd-h">
    <h2 id="cd-h" class="sur-s">Échéance de finalisation</h2>
    {#if ch.ouvert}
      <div class="volets" aria-hidden="true">
        {#each volets.jours.split('') as c, i (i)}<span class="volet">{c}</span>{/each}<span class="unite">J</span>
        {#each volets.heures.split('') as c, i (i)}<span class="volet">{c}</span>{/each}<span class="unite fin">H</span>
      </div>
      <p class="reste">{phraseReste(ch.resteMs)} · échéance {jourMoisHeure(ch.echeance)}</p>
      <p class="aprs">Après l’échéance, plus aucune transaction n’est possible sur ce billet.</p>
    {:else}
      <p class="reste" role="alert"><Icone nom="alerte" taille={18} />L’échéance est passée ({jourMoisHeure(ch.echeance)}).</p>
      <p class="aprs">Plus aucune transaction n’est possible sur ce billet : il voyagera au nom de son détenteur.</p>
    {/if}
  </section>

  {/snippet}

  {#snippet carteVol()}
  <div class="vol">
    <span class="route">{vol.de} → {vol.vers}</span>
    <span class="det">{jourCompletCapitale(ch.depart)} · {heure(ch.depart)}<br />{compagnieDe(vol).nom} {vol.numero.split(' ')[1]} · {vol.escales.length ? `${vol.escales.length} escale${vol.escales.length > 1 ? 's' : ''}` : 'direct'}</span>
    <span class="puce signal">À nommer</span>
  </div>

  {/snippet}

  {#snippet formulaire()}
    {#if ch.ouvert}
      <fieldset class="qui" class:pcx={ecran.pc}>
        <legend class="t-h2">Qui voyage&nbsp;?</legend>
        {#each options as o (o.v)}
          <label class="option" class:on={qui === o.v} for="who-{o.v}"><input id="who-{o.v}" type="radio" name="voyageur" value={o.v} checked={qui === o.v} onchange={() => choisir(o.v)} />
            <span class="tx grow"><span class="t1">{o.titre}</span><span class="t-sec">{o.sous}</span></span>
            {#if o.v === 'moi'}<span class="avatar" aria-hidden="true">{initiales(compte.prenom, compte.nom)}</span>{:else if o.v === 'proche'}<span class="ico"><Pic nom="proches" taille={22} /></span>{:else}<span class="ico"><Icone nom="plus" taille={22} /></span>{/if}</label>
        {/each}
      </fieldset>


      <section aria-labelledby="pp-h" class="col g14 pp" class:pcx={ecran.pc}>
        <div class="col g4"><h2 id="pp-h" class="t-h2">Tel qu’inscrit sur le passeport</h2><p class="t-sec">Transmis à {compagnieDe(vol).nom} tel quel. Vérifiez l’orthographe et l’ordre des prénoms.</p></div>

        {#if qui === 'proche'}
          {#if proches.length === 0}
            <div class="vide"><span class="t1">Aucun proche enregistré pour l’instant</span><span class="t-sec">Les voyageurs que vous nommez pourront être enregistrés ici pour la prochaine fois.</span>
              <button type="button" class="btn sec" onclick={() => choisir('nouveau')}><Icone nom="plus" taille={18} trait={2} />Saisir un nouveau voyageur</button></div>
          {:else}
            <div class="col g8" role="radiogroup" aria-label="Proches enregistrés" aria-describedby={montre('proche') ? 'proche-e' : undefined}>
              {#each proches as p (p.id)}
                <label class="option petite" class:on={procheId === p.id} for="proche-{p.id}"><input id="proche-{p.id}" type="radio" name="proche" value={p.id} checked={procheId === p.id} onchange={() => (procheId = p.id)} />
                  <span class="tx grow"><span class="t1">{p.prenom} {p.nom}</span><span class="t-sec">Proche enregistré</span></span><span class="avatar" aria-hidden="true">{initiales(p.prenom, p.nom)}</span></label>
              {/each}
            </div>
            {#if montre('proche')}<p class="erreur" id="proche-e" role="alert"><Icone nom="alerte" taille={16} />{montre('proche')}</p>{/if}
          {/if}
        {:else}
          <div class="col g14 champs" class:pcx={ecran.pc}>
            <div class="champ c-nom" data-erreur={montre('nom') ? '' : undefined}><label for="f-nom">Nom</label>
              <input id="f-nom" class="maj" type="text" bind:value={saisie.nom} autocomplete="family-name" placeholder="EXEMPLE" aria-invalid={montre('nom') ? 'true' : undefined} aria-describedby={montre('nom') ? 'f-nom-e' : undefined} />
              {#if montre('nom')}<span class="erreur" id="f-nom-e" role="alert"><Icone nom="alerte" taille={16} />{montre('nom')}</span>{/if}</div>
            <div class="champ c-prenom" data-erreur={montre('prenom') ? '' : undefined}><label for="f-prenom">Prénom(s)</label>
              <input id="f-prenom" type="text" bind:value={saisie.prenom} autocomplete="given-name" placeholder="Alex" aria-invalid={montre('prenom') ? 'true' : undefined} aria-describedby={montre('prenom') ? 'f-prenom-e' : undefined} />
              {#if montre('prenom')}<span class="erreur" id="f-prenom-e" role="alert"><Icone nom="alerte" taille={16} />{montre('prenom')}</span>{/if}</div>
            <div class="duo">
              <div class="champ c-nais" data-erreur={montre('naissance') ? '' : undefined}><label for="f-naissance">Date de naissance</label>
                <input id="f-naissance" type="date" bind:value={saisie.naissance} max={jourDe(tick)} autocomplete="bday" aria-invalid={montre('naissance') ? 'true' : undefined} aria-describedby={montre('naissance') ? 'f-naissance-e' : undefined} />
                {#if montre('naissance')}<span class="erreur" id="f-naissance-e" role="alert"><Icone nom="alerte" taille={16} />{montre('naissance')}</span>{/if}</div>
              <div class="champ c-genre"><label for="f-genre">Genre (selon la compagnie)</label>
                <span class="select"><select id="f-genre" value={saisie.genre} onchange={(e) => (saisie.genre = e.currentTarget.value as Genre)}>{#each GENRES as g (g.valeur)}<option value={g.valeur}>{g.libelle}</option>{/each}</select><span class="chev" aria-hidden="true"><Pic nom="bas" taille={18} trait={2} /></span></span></div>
            </div>
            <div class="champ c-doc" data-erreur={montre('document') ? '' : undefined}><label for="f-doc">Numéro de document (si exigé)</label>
              <input id="f-doc" class="mono" type="text" bind:value={saisie.document} autocomplete="off" placeholder="Passeport" aria-invalid={montre('document') ? 'true' : undefined} aria-describedby={montre('document') ? 'f-doc-e' : 'f-doc-a'} />
              {#if montre('document')}<span class="erreur" id="f-doc-e" role="alert"><Icone nom="alerte" taille={16} />{montre('document')}</span>{:else}<span class="aide" id="f-doc-a">Selon les exigences d’{compagnieDe(vol).nom} et de la destination.</span>{/if}</div>
          </div>
        {/if}
      </section>


      <div class="definitif" role="note"><Icone nom="cadenas" taille={22} trait={2} />
        <span class="col g6"><span class="d1"><strong>Action définitive&nbsp;:</strong> une fois le voyageur nommé, ce billet ne peut plus être revendu ni transféré.</span><span class="d2">Toute modification ensuite relève des règles d’{compagnieDe(vol).nom}.</span></span></div>

      <label class="confirme" class:err={manqueConsent && !consent} for="consent"><input id="consent" type="checkbox" bind:checked={consent} onchange={() => (manqueConsent = false)} aria-describedby="hint-consent" />
        <span>Je confirme que ces informations correspondent au passeport du voyageur et j’accepte que ce billet ne puisse plus être revendu ni transféré.</span></label>
    {:else}
      <div class="carte col g12"><p class="t-section">Le nommage est fermé</p><p class="t-sec">L’échéance de finalisation est passée : le billet voyage au nom de son détenteur. Aucune modification n’est possible ici.</p>
        <a class="btn sec" href="/voyage/{droit.id}" onclick={(e) => naviguer(e, `/voyage/${droit.id}`)}>Voir mon voyage</a></div>
    {/if}
  {/snippet}

  {#snippet alertes()}
    {#if !reseau.enLigne}
      {#if ecran.pc}<div class="alerte info" id="msg-hors-ligne" role="status"><Icone nom="hors_ligne" taille={22} /><span class="al-t"><strong>Hors ligne</strong><span>Vous pouvez préparer la saisie : la transmission à {compagnieDe(vol).nom} demande le réseau. Rien n’a été transmis.</span></span></div>
      {:else}<p class="alerte" role="alert"><Icone nom="hors_ligne" taille={18} />Vous êtes hors ligne : la transmission attend le retour du réseau.</p>{/if}
    {/if}
    {#if ecran.pc && tente && Object.keys(erreurs).length}<div class="alerte" role="alert"><Icone nom="alerte" taille={22} /><span class="al-t"><strong>Vérifiez les champs signalés</strong><span>Rien n’a été transmis à {compagnieDe(vol).nom}. Complétez les champs signalés puis confirmez à nouveau.</span></span></div>{/if}
    {#if erreurMarche}<p class="alerte" role="alert"><Icone nom="alerte" taille={ecran.pc ? 22 : 18} />{erreurMarche}</p>{/if}
  {/snippet}

  {#snippet confirmer_()}
    <p class="ligne-v"><span>Voyageur transmis</span><span class="nom" aria-live="polite">{ligne}</span></p>
    <button type="button" class="btn" aria-disabled={!consent || envoi ? 'true' : undefined} aria-describedby="hint-consent" onclick={confirmer}><Icone nom="ok" taille={20} trait={2} />Confirmer et transmettre à {compagnieDe(vol).nom}</button>
    {#if !consent}<p class="hint" id="hint-consent">Cochez la confirmation pour continuer.</p>{:else}<p class="sr" id="hint-consent">Confirmation cochée.</p>{/if}
  {/snippet}

  {#snippet pied()}
    {#if ch.ouvert}
      {@render alertes()}
      {@render confirmer_()}
    {/if}
  {/snippet}

  <Ecran titre={ecran.pc ? undefined : 'Nommer le voyageur'} face="jour" retour="/voyage/{droit.id}" onglet={ecran.pc ? 'rechercher' : undefined} large pied={ecran.pc ? undefined : pied}>
    {#if ecran.pc}
      <button type="button" class="retour-o" onclick={() => aller(`/voyage/${droit.id}`)}><Icone nom="retour" taille={20} trait={2} />Mon voyage</button>
      <section class="titre-pc" aria-labelledby="titre-pc"><h1 id="titre-pc">Nommer le voyageur</h1><p>Voyager · {vol.de} → {vol.vers} · {jourComplet(ch.depart)}</p></section>
      {#if ch.ouvert}
        <div class="grille">
          <div class="gauche">{@render alertes()}{@render formulaire()}</div>
          <div class="droite">
            {@render rebours()}
            <section class="resume" aria-labelledby="sum-h"><h2 id="sum-h" class="sr">Récapitulatif du billet</h2>
              <div class="r-t"><div class="col g2"><span class="route">{vol.de} → {vol.vers}</span><span class="det">{jourCompletCapitale(ch.depart)} · {heure(ch.depart)}<br />{compagnieDe(vol).nom} {vol.numero.split(' ')[1]} · {vol.escales.length ? `${vol.escales.length} escale${vol.escales.length > 1 ? 's' : ''}` : 'direct'}</span></div><span class="puce signal">À nommer</span></div>
              {@render confirmer_()}
            </section>
          </div>
        </div>
      {:else}
        <div class="grille">
          <section class="tardif carte col g12" role="status" aria-labelledby="late-h"><Icone nom="horloge" taille={26} />
            <h2 id="late-h" class="t-late">L’échéance du {jourMoisHeure(ch.echeance)} est passée</h2>
            <p class="t-sec late-p">Le détenteur ({droit.voyageur ? nomCourt(droit.voyageur.prenom, droit.voyageur.nom) : nomCourt(compte.prenom, compte.nom)}) est nommé voyageur par défaut. Plus aucune transaction n’est possible sur ce billet : toute modification relève désormais des règles d’{compagnieDe(vol).nom}.</p>
            <a class="btn" href="/voyage/{droit.id}" onclick={(e) => naviguer(e, `/voyage/${droit.id}`)}>Voir mon voyage<Icone nom="suivant" taille={18} trait={2} /></a></section>
        </div>
      {/if}
    {:else}
      {@render rebours()}
      {@render carteVol()}
      {@render formulaire()}
    {/if}
  </Ecran>
{/if}

<style>
  .sur-s { margin: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #c9d3df; }
  .t-h2 { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; padding: 0; }
  .rebours { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: #0b1b2e; color: #fff; }
  .volets { display: flex; align-items: flex-end; gap: 4px; }
  .volet { width: 34px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 5px; background: #1b2d45; box-shadow: inset 0 -24px 0 #15263c; font: 600 30px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--signal); }
  .unite { padding: 0 12px 4px 4px; font: 600 20px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; color: #c9d3df; } .unite.fin { padding-right: 0; }
  .reste { display: flex; align-items: center; gap: 8px; font: 600 15px/20px 'Barlow', sans-serif; } .aprs { font: 400 12px/17px 'Barlow', sans-serif; color: #c9d3df; }
  .vol { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--surface); box-shadow: var(--ombre); flex-wrap: wrap; }
  .route { font: 700 26px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; white-space: nowrap; }
  .det { flex: 1; min-width: 150px; font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink2); }
  .qui { margin: 0; padding: 0; border: 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; } .qui legend { margin-bottom: 10px; }
  .option { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 14px; border-radius: 14px; background: var(--surface); border: 2px solid var(--line); cursor: pointer; }
  .option.petite { min-height: 56px; } .option.on { border-color: var(--accent); }
  .option:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
  .option input { width: 22px; height: 22px; margin: 0; flex: none; accent-color: var(--accent); cursor: pointer; }
  .tx { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .t1 { font: 700 15px/20px 'Barlow', sans-serif; }
  .avatar { width: 32px; height: 32px; flex: none; border-radius: 999px; background: #0b1b2e; color: #fff; display: flex; align-items: center; justify-content: center; font: 700 12px/1 'Barlow', sans-serif; }
  .ico { color: var(--ink2); display: flex; }
  .g14 { gap: 14px; } .g6 { gap: 6px; }
  .vide { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 16px; border: 1.5px dashed var(--line-strong); background: var(--surface); }
  .vide .btn { min-height: 48px; }
  .duo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: start; }
  .champ input, .champ select { width: 100%; min-width: 0; } .champ input[type='date'] { padding: 0 10px; font-size: 15px; color-scheme: light; }
  .champ input.maj { text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em; } .champ .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
  .champ select { appearance: none; -webkit-appearance: none; padding: 0 36px 0 12px; font-size: 15px; cursor: pointer; }
  .select { position: relative; display: block; } .chev { position: absolute; right: 12px; top: 17px; pointer-events: none; color: var(--ink2); display: flex; }
  .erreur { display: flex; gap: 6px; align-items: flex-start; font: 500 13px/18px 'Barlow', sans-serif; color: var(--err); }
  .definitif { display: flex; align-items: flex-start; gap: 12px; padding: 14px; border-radius: 14px; background: rgba(255, 210, 63, 0.3); border: 1px solid rgba(92, 70, 0, 0.25); color: #5c4600; }
  .definitif :global(svg) { margin-top: 2px; } .d1 { font: 400 15px/21px 'Barlow', sans-serif; } .d2 { font: 400 13px/18px 'Barlow', sans-serif; }
  .confirme { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; padding: 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); cursor: pointer; font: 400 14px/20px 'Barlow', sans-serif; }
  .confirme.err { border: 2px solid var(--err); padding: 13px; }
  .confirme input { width: 24px; height: 24px; margin: 0; flex: none; accent-color: var(--accent); cursor: pointer; }
  .ligne-v { background: var(--bg); padding-top: 6px; box-shadow: 0 -10px 12px var(--bg); display: flex; align-items: center; justify-content: space-between; gap: 8px; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .nom { font-weight: 700; letter-spacing: 0.04em; color: var(--ink); text-align: right; overflow-wrap: anywhere; }
  .btn[aria-disabled='true'] { background: var(--surface2); color: var(--ink2); border-color: var(--line); opacity: 1; cursor: not-allowed; }
  .hint { text-align: center; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .alerte { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 600 13px/18px 'Barlow', sans-serif; }
  /* PC (≥ 900 px) : planche WebFinaliser — formulaire à gauche ; à droite, l'échéance et le récapitulatif collants avec le bouton de confirmation. */
  .retour-o { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px 0 6px; margin-left: -6px; border: 0; border-radius: 12px; background: none; color: var(--accent); font: 700 15px/1 'Barlow', sans-serif; cursor: pointer; }
  .titre-pc h1 { margin: 0; font: 600 44px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.01em; text-transform: uppercase; text-wrap: balance; }
  .titre-pc p { margin: 6px 0 0; font: 600 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .grille { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 24px; align-items: start; }
  .gauche { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  .droite { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  .droite .rebours { gap: 12px; } .droite .volet { width: 26px; height: 36px; font-size: 22px; box-shadow: inset 0 -18px 0 #15263c; }
  .droite .unite { width: 26px; padding: 0; text-align: center; font: 600 18px/36px 'IBM Plex Mono', ui-monospace, monospace; } .droite .volets { gap: 3px; align-items: center; }
  .droite .aprs { font-size: 13px; line-height: 18px; }
  .resume { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .r-t { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .resume .route { font-size: 28px; line-height: 30px; letter-spacing: 0.02em; } .resume .det { min-width: 0; font-size: 13px; line-height: 18px; }
  .resume .ligne-v { flex-direction: column; align-items: stretch; gap: 2px; padding: 12px 0 0; border-top: 1px solid var(--line); background: none; box-shadow: none; font-size: 13px; color: var(--ink2); }
  .resume .nom { font: 600 17px/22px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0; text-align: left; }
  .resume .btn { min-height: 52px; padding: 8px 18px; text-align: center; }
  .resume .hint { color: var(--ink2); }
  .g2 { gap: 2px; }
  .qui.pcx { flex-direction: row; flex-wrap: wrap; gap: 10px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .qui.pcx legend { padding: 0 6px; margin: 0 0 0 -6px; color: var(--ink); }
  .qui.pcx .option { flex: 1 1 220px; min-width: 0; min-height: 72px; border-width: 1px; }
  .qui.pcx .option.on { border-width: 2px; padding: 9px 13px; }
  .pp.pcx { padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .pp.pcx .t-sec { font: 400 14px/20px 'Barlow', sans-serif; }
  .champs.pcx { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; }
  .champs.pcx .duo { display: contents; }
  .champs.pcx .c-nom, .champs.pcx .c-prenom, .champs.pcx .c-nais { grid-column: span 2; }
  .champs.pcx .c-genre, .champs.pcx .c-doc { grid-column: span 3; }
  .champs.pcx .champ input[type='date'] { padding: 0 14px; font-size: 16px; } .champs.pcx .champ select { padding: 0 40px 0 14px; font-size: 16px; }
  .gauche .definitif { padding: 16px; border: 0; border-radius: 16px; color: var(--ink); } .gauche .d1 { font-size: 14px; line-height: 20px; } .gauche .d2 { font-size: 14px; line-height: 20px; color: var(--ink2); }
  .gauche .confirme { border-color: var(--line-strong); font-size: 15px; line-height: 21px; }
  .gauche .alerte { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 12px 16px; border-radius: 14px; background: var(--err-soft); border: 1px solid var(--err); color: var(--ink); font: 500 15px/20px 'Barlow', sans-serif; }
  .gauche .alerte.info { background: var(--surface2); border-color: var(--line-strong); }
  .gauche .alerte > :global(svg) { flex: none; color: var(--err); } .gauche .alerte.info > :global(svg) { color: var(--ink); }
  .al-t { display: flex; flex-direction: column; gap: 2px; flex: 1 1 280px; min-width: 0; } .al-t strong { font: 700 15px/20px 'Barlow', sans-serif; } .al-t span { font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); }
  .tardif { grid-column: 1; padding: 22px; border: 1px solid var(--line-strong); box-shadow: none; align-items: flex-start; color: var(--ink2); }
  .t-late { font: 600 30px/32px 'Barlow Condensed', 'Arial Narrow', sans-serif; color: var(--ink); } .late-p { font: 400 15px/22px 'Barlow', sans-serif; }
  .tardif .btn { min-height: 52px; }
</style>
