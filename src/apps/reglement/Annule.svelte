<script lang="ts">
  import { aller, param } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { annulerBillet, billetParId, compagnieDe, departEnMs, departParId, gare, heureLocale, ligneDe, minutesAvant, partPayee, personne, personneCourante, type ResultatAnnulation } from '../../domain/actions.ts';
  import { app, aujourdhui } from '../../data/store.svelte.ts';
  import { DELAI_ANNULATION_MIN, fmtF, remboursement } from '../../core/tarif.ts';
  import { ajouterJours, jourDe, jourSemaineCourt } from '../../core/dates.ts';
  import { codeAffiche, formaterTel } from '../../core/reglement.ts';
  import { etat } from './etat.ts';

  /** Annulation d'un billet : remboursement calculé par `core/tarif.remboursement` (10 % de frais jusqu'à 2 h avant, rien après), puis `annulerBillet()`. */
  const e = etat(), moi = personneCourante();
  const MOTIFS = ['Changement de plan', 'Trop cher', 'Autre bus', 'Erreur'];
  const billet = $derived((() => { const id = param('billet'); return id ? billetParId(id) : undefined; })());
  const proprio = $derived(!!billet && !!moi && (billet.acheteurId === moi.id || billet.passager.tel === moi.tel));
  const depart = $derived(billet ? departParId(billet.departId) : undefined);
  const ligne = $derived(depart ? ligneDe(depart) : undefined);
  const paiement = $derived(billet ? app.monde.paiements.find((p) => p.id === billet.paiementId) : undefined);
  const payeur = $derived(personne(paiement?.payeurId ?? billet?.acheteurId));
  const apercu = $derived(billet && depart ? (() => { const r = remboursement(billet.prix, minutesAvant(depart)); return { ...r, rembourse: Math.round(r.rembourse * partPayee(billet)) }; })() : null);
  const limite = $derived(depart ? departEnMs(depart) - DELAI_ANNULATION_MIN * 60_000 : 0);
  const vers = $derived(!paiement ? 'ton compte' : paiement.moyen === 'om' ? 'Orange Money' : paiement.moyen === 'carte' ? 'ta carte bancaire' : paiement.moyen === 'especes' ? 'le guichet (espèces)' : paiement.moyen === 'proche' && payeur?.id !== moi?.id ? `le compte de ${payeur?.prenom ?? 'ton proche'}` : 'MoMo');
  const quandLimite = $derived.by(() => { const j = jourDe(new Date(limite)), auj = aujourdhui(); return j === auj ? 'aujourd’hui' : j === ajouterJours(auj, 1) ? 'demain' : `le ${jourSemaineCourt(j)}`; });
  let fait = $state<ResultatAnnulation | null>(null), motif = $state(-1), erreur = $state('');
  const aVenir = $derived(billet?.statut === 'valide');

  function confirmer() {
    if (!billet) return;
    const r = annulerBillet(billet.id); erreur = '';
    if (!r.possible) { erreur = r.raison; return; }
    if (motif >= 0) e.motifsAnnulation[billet.id] = MOTIFS[motif];
    fait = r;
  }
  const nav = (ev: Event, v: string) => { ev.preventDefault(); aller(v); };
  const titre = $derived(fait ? 'Billet annulé' : 'Annuler ce billet ?');
</script>

<Mobile titre={titre} retourVers={billet ? `/pass?billet=${billet.id}` : '/pass'}>
  {#snippet droite()}{#if billet && proprio}<span class="pl {fait ? 'ok' : 'wa'}">{fait ? 'remboursé' : 'réversible'}</span>{/if}{/snippet}

  {#if !billet || !proprio || !depart || !ligne}
    <div class="center"><span class="ill" aria-hidden="true"><Icone nom="billet" taille={56} /></span>
      <span class="ttl t20">Billet introuvable</span>
      <span class="t14 mut" style="max-width: 30ch">Ce billet n’existe pas ou n’est pas à ton nom.</span>
      <a class="b p" href="/pass" onclick={(ev) => nav(ev, '/pass')}>Mes billets</a></div>
  {:else if !aVenir && !fait}
    <div class="center"><span class="ill er" aria-hidden="true"><Icone nom="alerte" taille={56} /></span>
      <span class="ttl t20">{billet.statut === 'scanne' ? 'Billet déjà utilisé' : 'Billet déjà annulé'}</span>
      <span class="t14 mut" style="max-width: 30ch">{billet.statut === 'scanne' ? 'Ce billet a été scanné au quai : il ne peut plus être annulé.' : 'Ce billet n’est plus valable ; rien d’autre à faire.'}</span>
      <a class="b p" href="/pass?billet={billet.id}" onclick={(ev) => nav(ev, `/pass?billet=${billet.id}`)}>Retour au billet</a></div>
  {:else}
    {@const r = fait ?? apercu!}
    <div class="gl"><div class="col"><span class="lab">Billet</span><span class="t16 b7">{ligne.de} → {ligne.vers} · {billet.siege ?? 'place libre'}</span><span class="t13 mut">{compagnieDe(depart).nom} · {jourSemaineCourt(depart.jour)} · {heureLocale(departEnMs(depart))} · {codeAffiche(billet.code)}</span><span class="t12 mut3">{gare(ligne.gareDe)?.nom} → {gare(ligne.gareVers)?.nom}</span></div></div>
    <span class="lab">Remboursement</span>
    <div class="gl col" style="gap: 0">
      <div class="li"><span class="grow">Billet payé</span><span class="mono b7">{fmtF(billet.prix)}</span></div>
      {#if r.possible}
        <div class="li"><span class="grow">{r.raison}</span><span class="mono b7 erc">− {fmtF(r.frais)}</span></div>
        <div class="li"><span class="grow t16 b7">Remboursé sur {vers}</span><span class="ttl t20 okc" aria-label="Remboursé : {r.rembourse} francs">{fmtF(r.rembourse)}</span></div>
      {:else}
        <div class="li"><span class="grow erc">{r.raison}</span><span class="ttl t20 erc">0 F</span></div>
      {/if}
    </div>
    {#if !fait}
      <div class="toast"><span class="bub aq"><Icone nom="horloge" /></span>
        <span class="t13 grow">{#if r.possible}Remboursement sous 5 min{payeur?.tel ? ` sur ${formaterTel(payeur.tel)}` : ''}. Après {heureLocale(limite)} {quandLimite}, le billet ne serait plus remboursable.{:else}Il reste moins de 2 h avant le départ : le billet ne peut plus être remboursé. Tu peux le garder ou le partager à un proche.{/if}</span></div>
      <span class="lab" id="lab-motif">Pourquoi ? (facultatif)</span>
      <div class="row g8 wrapf" role="group" aria-labelledby="lab-motif">
        {#each MOTIFS as m, i (m)}<button type="button" class="b s sm" class:p={motif === i} aria-pressed={motif === i} onclick={() => (motif = motif === i ? -1 : i)}>{m}</button>{/each}
      </div>
      {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
    {:else}
      <div class="center" style="flex: none" role="status"><span class="ill ok" aria-hidden="true"><Icone nom="ok" taille={56} trait={2.2} /></span>
        <span class="t16 b7">{fmtF(fait.rembourse)} renvoyés sur {vers}</span><span class="t13 mut">Place {billet.siege ?? ''} libérée · reçu envoyé par SMS</span></div>
    {/if}
    <div class="col g8" style="margin-top: auto">
      {#if !fait}
        <button type="button" class="b d" disabled={!r.possible} onclick={confirmer}>Confirmer l’annulation</button>
        <a class="b s" href="/calendrier" onclick={(ev) => nav(ev, '/calendrier')}>Changer de date plutôt (gratuit)</a>
        <a class="b g" href="/pass?billet={billet.id}" onclick={(ev) => nav(ev, `/pass?billet=${billet.id}`)}>Garder mon billet</a>
      {:else}
        <a class="b p" href="/" onclick={(ev) => nav(ev, '/')}>Chercher un autre départ</a>
        <a class="b g" href="/pass" onclick={(ev) => nav(ev, '/pass')}>Mes billets</a>
      {/if}
    </div>
  {/if}
</Mobile>

<style>
  .b:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
