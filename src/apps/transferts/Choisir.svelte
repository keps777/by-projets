<script lang="ts">
  import { onMount } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { droitDe } from '../../domain/marche.ts';
  import { brouillonDe, etatTransfert, majBrouillon, prochesEnregistres, prochesSansCompte, rechercherProche, trancheTransferts, type ProcheSansCompte } from '../../domain/transfert.ts';
  import { tempsReel } from '../voyager/temps.svelte.ts';
  import { va } from '../voyager/lien.ts';
  import Avatar from './Avatar.svelte';
  import CarteDroit from './CarteDroit.svelte';
  import ErreurVue from './ErreurVue.svelte';
  import Etapes from './Etapes.svelte';
  import Introuvable from './Introuvable.svelte';
  import { reseau } from './reseau.svelte.ts';
  import { CONSIGNE_CONTINUER, DESIGNATION_GENERIQUE, etatListe, resumeDroit } from './vues.ts';

  /** Transférer, étape 1 : choisir le proche. Recherche exacte (identifiant ou courriel), proches enregistrés, proches sans compte (invitation). Hors ligne : rien n'est modifié. */
  let { droitId = '' }: { droitId?: string } = $props();
  trancheTransferts();
  const temps = tempsReel(15_000);
  const compte = $derived(compteCourant());
  const droit = $derived(droitId ? droitDe(droitId) : undefined);
  const monDroit = $derived(!!droit && !!compte && droit.detenteurId === compte.id);
  const f = $derived(compte && monDroit ? etatTransfert(droitId, compte.id, temps.maintenant) : undefined);
  const resume = $derived(droit ? resumeDroit(app.monde, droit) : undefined);

  const registres = $derived(compte ? prochesEnregistres(compte.id) : []);
  const sansCompte = $derived(compte ? prochesSansCompte(compte.id) : []);
  let chargement = $state(true);
  onMount(() => { const t = setTimeout(() => (chargement = false), 350); return () => clearTimeout(t); });
  const vue = $derived(etatListe(param('etat'), reseau.enLigne, registres.length + sansCompte.length, chargement));
  const enLigne = $derived(vue !== 'horsligne');

  let requete = $state(''), cherche = $state(''), selection = $state<string | null>(null);
  $effect(() => { if (selection === null && droitId) { const b = brouillonDe(droitId); if (b?.versId) selection = b.versId; } });
  const trouve = $derived(cherche ? rechercherProche(cherche) : undefined);
  const soiMeme = $derived(!!trouve && trouve.id === compte?.id);
  const dansListe = $derived(!!trouve && !soiMeme && registres.some((p) => p.id === trouve.id));
  const nouveau = $derived(trouve && !soiMeme && !dansListe && enLigne ? trouve : undefined);
  const introuvable = $derived(!!cherche && !trouve && enLigne);
  const sel = $derived(enLigne && selection ? ([...registres, ...(nouveau ? [nouveau] : [])].find((p) => p.id === selection) ?? undefined) : undefined);

  function chercher() {
    if (!enLigne) return; cherche = requete.trim();
    const p = cherche ? rechercherProche(cherche) : undefined; if (p && p.id !== compte?.id) selection = p.id;
  }
  function continuer() {
    if (!sel || !droit || !f) return;
    majBrouillon(droitId, { versId: sel.id, sansCompte: undefined });
    aller(`/transferer/${encodeURIComponent(droitId)}/${f.avertissement ? 'echeance' : 'confirmer'}`);
  }
  function inviter(e: MouseEvent, p?: ProcheSansCompte) {
    majBrouillon(droitId, { versId: undefined, sansCompte: p ? { id: p.id, nom: p.nom, courriel: p.courriel } : { nom: DESIGNATION_GENERIQUE, ...(cherche.includes('@') && !cherche.startsWith('@') ? { courriel: cherche } : {}) } });
    va(e, `/transferer/${encodeURIComponent(droitId)}/sans-compte`);
  }
</script>

{#if !droitId}
  <!-- ancien écran réinstancié brièvement au changement de route : rien à montrer -->
{:else if !compte || !droit || !monDroit || !resume || !f}
  <Introuvable />
{:else if !f.ok}
  <ErreurVue {droitId} cas={f.motif === 'echeance' ? 'echeance' : 'vendu'} motif={f.motif} echeance={f.echeance} />
{:else}
  <Ecran titre="Transférer" face="nuit" retour={`/droit/${encodeURIComponent(droitId)}`}>
    <CarteDroit {resume} />
    <Etapes n={1} libelle="Choisir le proche" />
    <div class="col g12">
      <h1 class="grand">À qui le transférer ?</h1>
      <p class="chapo">Sans vente : votre proche reçoit ce droit sur son compte NexG-TT. Il doit déjà en avoir un.</p>
    </div>

    {#if !enLigne}
      <div class="info" role="alert"><Icone nom="info" taille={20} /><span class="col g4"><span class="i1">Vous êtes hors ligne</span><span class="i2">Le transfert exige une connexion. Rien n’est modifié ; reprenez ici une fois reconnecté.</span></span></div>
    {/if}

    <section class="col g8" aria-labelledby="rech-h">
      <h2 id="rech-h" class="sec-t">Chercher un proche</h2>
      <form class="col g8" onsubmit={(e) => { e.preventDefault(); chercher(); }}>
        <label for="recherche" class="etiq">Identifiant NexG-TT ou courriel</label>
        <div class="ligne">
          <input id="recherche" type="text" bind:value={requete} disabled={!enLigne} autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="@identifiant" aria-describedby={soiMeme ? 'rech-aide rech-erreur' : 'rech-aide'} aria-invalid={soiMeme ? 'true' : undefined} class:err={soiMeme} />
          <button type="submit" class="chercher" aria-disabled={!enLigne}>Chercher</button>
        </div>
      </form>
      <p id="rech-aide" class="aide">Recherche exacte. Nous ne montrons que le prénom et l’initiale du nom.</p>
      {#if soiMeme}<p id="rech-erreur" class="erreur" role="alert"><Icone nom="info" taille={16} /><span>Vous ne pouvez pas vous transférer ce droit à vous-même.</span></p>{/if}
    </section>

    <div role="status" class="col g12 resultats">
      {#if nouveau}
        <section class="col g8" aria-labelledby="res-h">
          <h2 id="res-h" class="sec-t">Résultat de la recherche</h2>
          <label class="proche" class:on={selection === nouveau.id} for="r-trouve">
            <input id="r-trouve" type="radio" name="proche" value={nouveau.id} checked={selection === nouveau.id} onchange={() => (selection = nouveau.id)} />
            <Avatar ini={nouveau.ini} /><span class="col g2 grow"><span class="nom">{nouveau.nom}</span><span class="ident">{nouveau.ident}</span></span>
          </label>
        </section>
      {/if}
      {#if trouve && dansListe}<p class="deja"><Icone nom="ok" taille={16} trait={2} /><span>{trouve.nom} est dans vos proches enregistrés : proche sélectionné.</span></p>{/if}
      {#if introuvable}
        <div class="rien">
          <span class="r1"><Icone nom="info" taille={18} /><span>Aucun compte trouvé pour « {cherche} »</span></span>
          <span class="r2">Vérifiez l’identifiant, ou invitez ce proche à créer un compte NexG-TT.</span>
          <a class="lien" href={`/transferer/${encodeURIComponent(droitId)}/sans-compte`} onclick={(e) => inviter(e)}>Inviter ce proche<Icone nom="suivant" taille={16} /></a>
        </div>
      {/if}
    </div>

    <section class="col g8" aria-labelledby="proches-h">
      <h2 id="proches-h" class="sec-t">Proches enregistrés</h2>
      {#if vue === 'chargement'}
        <div class="col g8" aria-busy="true"><p role="status" class="t-sec">Chargement de vos proches…</p>{#each [0, 1, 2] as i (i)}<span class="squelette" aria-hidden="true"></span>{/each}</div>
      {:else if vue === 'vide'}
        <div class="vide"><span class="v1">Aucun proche enregistré pour l’instant</span><span class="v2">Les voyageurs que vous nommez pourront être enregistrés ici. Pour l’instant, cherchez un proche par son identifiant.</span></div>
      {:else}
        <fieldset class="liste"><legend class="sr">Proches enregistrés</legend>
          <ul class="liste-plain col g8">
            {#each registres as p (p.id)}
              <li><label class="proche" class:on={selection === p.id} for={`r-${p.id}`}>
                <input id={`r-${p.id}`} type="radio" name="proche" value={p.id} checked={enLigne && selection === p.id} disabled={!enLigne} onchange={() => (selection = p.id)} />
                <Avatar ini={p.ini} /><span class="col g2 grow"><span class="nom">{p.nom}</span><span class="ident">{p.ident}</span></span>
              </label></li>
            {/each}
            {#each sansCompte as p (p.id)}
              <li><a class="proche sans" href={`/transferer/${encodeURIComponent(droitId)}/sans-compte`} onclick={(e) => inviter(e, p)}>
                <span class="vide-radio" aria-hidden="true"></span>
                <span class="avatar-vide" aria-hidden="true">{p.nom.split(' ').map((m) => m[0]).join('').slice(0, 2)}</span>
                <span class="col g2 grow"><span class="nom">{p.nom}</span><span class="sous-nom">{p.invite ? 'Invitation envoyée · sans compte NexG-TT' : 'Sans compte NexG-TT'}</span></span>
                <Icone nom="suivant" taille={18} />
              </a></li>
            {/each}
          </ul>
        </fieldset>
      {/if}
    </section>

    {#snippet pied()}
      {#if sel}
        <button type="button" class="btn" onclick={continuer}>Continuer avec {sel.nom}<Icone nom="suivant" taille={20} trait={2} /></button>
      {:else}
        <button type="button" class="btn inactif" aria-disabled="true" aria-describedby="hint-continuer">Continuer</button>
        <p id="hint-continuer" class="hint">{CONSIGNE_CONTINUER[vue]}</p>
      {/if}
    {/snippet}
  </Ecran>
{/if}

<style>
  .grand { font: 600 34px/36px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; text-transform: uppercase; text-wrap: balance; }
  .chapo { font: 400 15px/22px 'Barlow', sans-serif; color: var(--ink2); }
  .sec-t { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .etiq { font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .aide { font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink3); }
  .ligne { display: flex; gap: 8px; }
  input[type='text'] { flex: 1 1 0; width: 0; min-width: 0; height: 52px; padding: 0 14px; border-radius: 12px; background: var(--surface2); border: 1px solid #6b7282; color: var(--ink); font-size: 16px; }
  input[type='text'].err { border-color: var(--err); } input[type='text']:disabled { opacity: 0.6; }
  .chercher { flex: none; height: 52px; min-width: 44px; padding: 0 18px; border-radius: 14px; background: var(--surface2); border: 1px solid var(--line-strong); color: var(--ink); font: 700 16px/1 'Barlow', sans-serif; cursor: pointer; }
  .chercher[aria-disabled='true'] { color: var(--ink2); cursor: not-allowed; }
  .erreur { display: flex; align-items: flex-start; gap: 8px; font: 600 13px/18px 'Barlow', sans-serif; color: var(--err); } .erreur :global(svg) { margin-top: 1px; }
  .info { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--surface2); border: 1px solid var(--line-strong); } .info :global(svg) { margin-top: 1px; }
  .i1 { font: 700 15px/20px 'Barlow', sans-serif; } .i2 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .resultats:empty { display: none; }
  .proche { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 14px; border-radius: 14px; background: var(--surface); border: 2px solid var(--line); cursor: pointer; color: var(--ink); text-decoration: none; }
  .proche.on { background: rgba(255, 210, 63, 0.12); border-color: var(--accent); }
  .proche:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
  .proche input { width: 22px; height: 22px; margin: 0; flex: none; accent-color: #ffd23f; cursor: pointer; } .proche input:disabled { cursor: not-allowed; }
  .nom { font: 700 15px/20px 'Barlow', sans-serif; } .ident { font: 500 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); overflow-wrap: anywhere; }
  .sans { border-style: dashed; border-color: var(--line-strong); } .vide-radio { width: 22px; flex: none; }
  .avatar-vide { width: 32px; height: 32px; flex: none; border-radius: 999px; border: 1.5px dashed var(--ink3); color: var(--ink2); display: flex; align-items: center; justify-content: center; font: 700 12px/1 'Barlow', sans-serif; }
  .sous-nom { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .deja { display: flex; align-items: flex-start; gap: 8px; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .deja :global(svg) { margin-top: 1px; color: var(--ok); }
  .rien { display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: 14px; background: var(--surface2); border: 1px solid var(--line-strong); }
  .r1 { display: flex; align-items: flex-start; gap: 8px; font: 700 15px/20px 'Barlow', sans-serif; } .r1 :global(svg) { margin-top: 2px; } .r2 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .lien { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; min-height: 44px; font: 600 14px/1 'Barlow', sans-serif; color: var(--accent); }
  .liste { margin: 0; padding: 0; border: 0; min-width: 0; }
  .vide { display: flex; flex-direction: column; gap: 6px; padding: 18px; border-radius: 16px; border: 1.5px dashed var(--line-strong); background: var(--surface); } .v1 { font: 700 15px/20px 'Barlow', sans-serif; } .v2 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .squelette { height: 64px; border-radius: 14px; background: var(--surface2); animation: nx-pulse 1.4s ease-in-out infinite; }
  .btn.inactif { background: var(--surface3); color: var(--ink2); border-color: var(--line-strong); opacity: 1; }
  .hint { text-align: center; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
</style>
