<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { refAleatoire } from '../../core/regles.ts';
  import { compteCourant, compteDe } from '../../domain/compte.ts';
  import { droitDe } from '../../domain/marche.ts';
  import { brouillonDe, delaiHM, ErreurTransfert, etatTransfert, fraisTransfert, jourHeure, majBrouillon, nomCourt, procheDe, trancheTransferts, transferer, type CasErreur, type Motif } from '../../domain/transfert.ts';
  import { tempsReel } from '../voyager/temps.svelte.ts';
  import { va } from '../voyager/lien.ts';
  import Avatar from './Avatar.svelte';
  import CarteDroit from './CarteDroit.svelte';
  import ErreurVue from './ErreurVue.svelte';
  import Etapes from './Etapes.svelte';
  import Introuvable from './Introuvable.svelte';
  import { reseau } from './reseau.svelte.ts';
  import { resumeDroit } from './vues.ts';

  /** Transférer, étape 2 : vérifier puis confirmer. `confirmer` : transfert ordinaire ; `echeance` : l'échéance est proche, le proche aura peu de temps (avertissement + seconde case à cocher). Action définitive, double confirmation. */
  let { droitId = '', mode }: { droitId?: string; mode: 'confirmer' | 'echeance' } = $props();
  trancheTransferts();
  const temps = tempsReel(1000);
  const compte = $derived(compteCourant());
  const droit = $derived(droitId ? droitDe(droitId) : undefined);
  const monDroit = $derived(!!droit && !!compte && droit.detenteurId === compte.id);
  const f = $derived(compte && monDroit ? etatTransfert(droitId, compte.id, temps.maintenant) : undefined);
  const resume = $derived(droit ? resumeDroit(app.monde, droit) : undefined);
  const b = $derived(droitId ? brouillonDe(droitId) : undefined);
  const versCompte = $derived(b?.versId ? compteDe(b.versId) : undefined);
  const proche = $derived(versCompte ? procheDe(versCompte) : undefined);
  const id = $derived(encodeURIComponent(droitId));
  const frais = fraisTransfert();
  const avert = $derived(!!f?.ok && f.avertissement);

  let echeanceOk = $state(false), consent = $state(false), envoi = $state(false);
  const pret = $derived(consent && (!avert || echeanceOk));

  // L'écran suit la phase : l'échéance proche passe par `/echeance`, sinon `/confirmer` ; sans proche choisi, retour au choix. Seulement si cet écran est bien celui de la route courante.
  $effect(() => {
    if (!droitId || !f || !f.ok) return;
    const base = `/transferer/${id}`, ici = location.pathname.endsWith(`/${mode}`);
    const cible = !proche ? base : mode === 'confirmer' && f.avertissement ? `${base}/echeance` : mode === 'echeance' && !f.avertissement ? `${base}/confirmer` : null;
    if (cible && ici) aller(cible, { remplacer: true });
  });

  function echec(cas: CasErreur, motif?: Motif) {
    majBrouillon(droitId, { erreur: { cas, ...(motif ? { motif } : {}), ...(cas === 'technique' ? { incident: `INC-${refAleatoire(maintenant()).slice(4)}` } : {}), versNom: proche?.nom, quand: maintenant() } });
    aller(`/transferer/${id}/erreur`);
  }
  const CAS: Record<string, CasErreur> = { destinataire: 'destinataire', echeance: 'echeance', solde: 'solde', droit: 'vendu', soi_meme: 'vendu', compte: 'technique' };
  function transferer_() {
    if (!pret || envoi || !compte || !versCompte) return;
    envoi = true;
    if (!reseau.enLigne) { envoi = false; return echec('reseau'); }
    if (param('etat') === 'echec') { envoi = false; return echec('technique'); }
    try { transferer(droitId, compte.id, versCompte.id); aller(`/transferer/${id}/fait`, { remplacer: true }); }
    catch (e) {
      envoi = false; if (!(e instanceof ErreurTransfert)) throw e;
      echec(CAS[e.code] ?? 'technique', e.code === 'droit' ? etatTransfert(droitId, compte.id).motif : undefined);
    }
  }
</script>

{#if !droitId}
  <!-- ancien écran réinstancié brièvement au changement de route : rien à montrer -->
{:else if !compte || !droit || !monDroit || !resume || !f}
  <Introuvable />
{:else if !f.ok}
  <ErreurVue {droitId} cas={f.motif === 'echeance' ? 'echeance' : 'vendu'} motif={f.motif} versNom={proche?.nom} echeance={f.echeance} />
{:else if proche}
  <Ecran titre="Confirmer" face="nuit" retour={`/transferer/${id}`}>
    {#if frais > 0}<div class="demo" role="note"><Icone nom="info" taille={18} />MODE DÉMO — aucun paiement réel</div>{/if}
    {#if !reseau.enLigne}
      <div class="info" role="alert"><Icone nom="info" taille={20} /><span class="col g4"><span class="i1">Vous êtes hors ligne</span><span class="i2">Le transfert exige une connexion. Rien n’est modifié ; reprenez ici une fois reconnecté.</span></span></div>
    {/if}
    <Etapes n={2} libelle="Confirmer" />
    <h1 class="grand">Vérifiez avant de transférer</h1>

    {#if avert}
      <section class="rebours" aria-labelledby="cd-h">
        <h2 id="cd-h" class="t-sur">Échéance de finalisation</h2>
        <div class="tuiles" aria-hidden="true">
          {#each String(Math.floor(f.msRestant / 3_600_000)).padStart(2, '0') as c, i (i)}<span class="tuile">{c}</span>{/each}<span class="unite">H</span>
          {#each String(Math.floor((f.msRestant % 3_600_000) / 60_000)).padStart(2, '0') as c, i (i)}<span class="tuile">{c}</span>{/each}<span class="unite fin">MIN</span>
        </div>
        <p class="reste">Il reste {delaiHM(f.msRestant)} · échéance {jourHeure(f.echeance)}</p>
        <p class="petit">Après l’échéance, plus aucune transaction n’est possible sur ce billet.</p>
      </section>
      <div class="alerte" role="alert">
        <Icone nom="horloge" taille={22} />
        <span class="col g6"><span class="a1">Échéance proche : {proche.nom} aura peu de temps</span><span class="a2">{proche.nom} doit nommer le voyageur avant ce moment, sinon c’est {proche.nom} qui voyage par défaut.</span><span class="a3">Seuil de l’avertissement : hypothèse à valider [H].</span></span>
      </div>
      <label class="case or" for="echeance"><input id="echeance" type="checkbox" bind:checked={echeanceOk} /><span>Je comprends que {proche.nom} n’aura que {delaiHM(f.msRestant)} pour nommer le voyageur.</span></label>
    {/if}

    <section class="col g2" aria-label="De qui, à qui">
      <div class="deux">
        <div class="partie"><span class="t-sur petit-sur">De</span><span class="qui"><Avatar ini={`${compte.prenom[0] ?? ''}${compte.nom[0] ?? ''}`.toUpperCase()} /><span class="nom">{nomCourt(compte)}</span></span><span class="sous">Vous, détenteur</span></div>
        <span class="fleche" aria-hidden="true"><Icone nom="suivant" taille={18} trait={2} /></span>
        <div class="partie dest"><span class="t-sur petit-sur">À</span><span class="qui"><Avatar ini={proche.ini} /><span class="nom">{proche.nom}</span></span><span class="ident">{proche.ident}</span></div>
      </div>
      <a class="modifier" href={`/transferer/${id}`} onclick={(e) => va(e, `/transferer/${id}`)}>Modifier le proche</a>
    </section>

    <CarteDroit {resume} />

    <section class="col g12" aria-labelledby="suite-h">
      <h2 id="suite-h" class="sec-t">Ce qui va se passer</h2>
      <ol class="liste-plain etapes">
        <li><span class="num" aria-hidden="true">1</span><span>{proche.nom} devient détenteur de ce droit tout de suite.</span></li>
        <li><span class="num" aria-hidden="true">2</span><span>Votre statut passe à « Cédé ». Le droit reste dans votre historique.</span></li>
        <li><span class="num" aria-hidden="true">3</span><span>{#if avert}{proche.nom} dispose de {delaiHM(f.msRestant)} pour nommer le voyageur, avant le {jourHeure(f.echeance)}. Sans nom à cette échéance, {proche.nom} voyage par défaut.{:else}{proche.nom} nomme le voyageur avant le {jourHeure(f.echeance)}. Sans nom à cette échéance, {proche.nom} voyage par défaut.{/if}</span></li>
        <li><span class="num" aria-hidden="true">4</span><span>Aucune vente : aucun paiement ne passe entre vous.</span></li>
      </ol>
    </section>

    <section class="cout" aria-labelledby="frais-h">
      <h2 id="frais-h" class="sec-t">Coût du transfert</h2>
      <dl>
        <div class="l1"><dt>Frais de transfert<span class="sous">Hypothèse à valider</span></dt><dd>{fmt(frais)}</dd></div>
        <div class="l2"><dt>Total à payer</dt><dd class="gros">{fmt(frais)}</dd></div>
      </dl>
      <p class="petit">Montant fictif : les frais ne sont pas décidés.</p>
    </section>

    <div class="alerte" role="note">
      <Icone nom="cadenas" taille={22} />
      <span class="col g6"><span class="a0"><strong>Action définitive&nbsp;:</strong> une fois le transfert fait, seule {proche.nom} peut agir sur ce droit.</span><span class="a3">Hypothèse [H] : ni refus ni annulation n’est prévu.</span></span>
    </div>

    <label class="case" for="confirmation"><input id="confirmation" type="checkbox" bind:checked={consent} /><span>Je confirme transférer ce droit à {proche.nom} ({proche.ident}) et je comprends que c’est définitif.</span></label>

    {#snippet pied()}
      {#if pret}
        <button type="button" class="btn" onclick={transferer_} disabled={envoi}><Icone nom="echange" taille={20} trait={2} />Transférer à {proche.nom}</button>
      {:else}
        <button type="button" class="btn inactif" aria-disabled="true" aria-describedby="hint-consent">Transférer à {proche.nom}</button>
        <p id="hint-consent" class="hint">{avert ? 'Cochez les deux confirmations pour continuer.' : 'Cochez la confirmation pour continuer.'}</p>
      {/if}
    {/snippet}
  </Ecran>
{/if}

<style>
  .grand { font: 600 34px/36px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; text-transform: uppercase; text-wrap: balance; }
  .sec-t { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .demo { display: flex; align-items: center; gap: 8px; background: rgba(98, 199, 255, 0.12); border: 1px solid rgba(98, 199, 255, 0.4); color: var(--up); border-radius: 12px; padding: 10px 12px; font: 600 13px/18px 'Barlow', sans-serif; }
  .info { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--surface2); border: 1px solid var(--line-strong); } .info :global(svg) { margin-top: 1px; }
  .i1 { font: 700 15px/20px 'Barlow', sans-serif; } .i2 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .rebours { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: #060708; border: 1px solid var(--line); }
  .tuiles { display: flex; align-items: flex-end; gap: 4px; }
  .tuile { width: 34px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 5px; background: #1c1f25; box-shadow: inset 0 -24px 0 #15171b; font: 600 30px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--accent); }
  .unite { padding: 0 12px 4px 4px; font: 600 20px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; color: var(--ink2); } .unite.fin { padding: 0 0 4px 4px; }
  .reste { font: 600 15px/21px 'Barlow', sans-serif; } .petit { font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink2); }
  .alerte { display: flex; align-items: flex-start; gap: 12px; padding: 14px; border-radius: 14px; background: rgba(255, 210, 63, 0.12); border: 1px solid rgba(255, 210, 63, 0.4); } .alerte > :global(svg) { color: var(--accent); }
  .a1 { font: 700 15px/21px 'Barlow', sans-serif; color: var(--accent); } .a2 { font: 400 14px/20px 'Barlow', sans-serif; } .a0 { font: 400 15px/21px 'Barlow', sans-serif; } .a0 strong { color: var(--accent); } .a3 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .case { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; padding: 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); cursor: pointer; font: 400 14px/20px 'Barlow', sans-serif; }
  .case.or { border-color: var(--accent); } .case:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
  .case input { width: 24px; height: 24px; margin: 0; flex: none; accent-color: #ffd23f; cursor: pointer; }
  .deux { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: stretch; gap: 8px; }
  .partie { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; background: var(--surface2); min-width: 0; } .dest { border: 1px solid var(--accent); }
  .petit-sur { font-size: 11px; line-height: 14px; color: var(--ink2); }
  .qui { display: flex; align-items: center; gap: 8px; min-width: 0; } .nom { font: 700 15px/20px 'Barlow', sans-serif; overflow-wrap: anywhere; }
  .sous { font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink2); } .ident { font: 500 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); overflow-wrap: anywhere; }
  .fleche { align-self: center; color: var(--ink3); display: flex; }
  .modifier { align-self: flex-end; display: inline-flex; align-items: center; min-height: 44px; font: 600 14px/1 'Barlow', sans-serif; color: var(--accent); }
  .etapes { display: flex; flex-direction: column; gap: 12px; } .etapes li { display: grid; grid-template-columns: 28px 1fr; gap: 12px; align-items: start; font: 400 15px/22px 'Barlow', sans-serif; }
  .num { width: 28px; height: 28px; border-radius: 999px; background: var(--surface3); display: flex; align-items: center; justify-content: center; font: 600 13px/1 'IBM Plex Mono', ui-monospace, monospace; }
  .cout { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  dl { margin: 0; display: flex; flex-direction: column; } dt, dd { margin: 0; }
  .l1, .l2 { display: flex; align-items: center; justify-content: space-between; gap: 12px; } .l1 { min-height: 52px; border-bottom: 1px solid var(--line); } .l2 { min-height: 56px; }
  .l1 dt { display: flex; flex-direction: column; font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .l1 dt .sous { color: var(--ink3); } .l1 dd { font: 600 15px/20px 'IBM Plex Mono', ui-monospace, monospace; }
  .l2 dt { font: 700 16px/22px 'Barlow', sans-serif; } .gros { font: 600 28px/32px 'IBM Plex Mono', ui-monospace, monospace; }
  .btn.inactif { background: var(--surface3); color: var(--ink2); border-color: var(--line-strong); opacity: 1; }
  .hint { text-align: center; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
</style>
