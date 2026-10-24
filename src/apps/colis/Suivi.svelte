<script lang="ts">
  import { aller, param } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { avancerColis, colisDe, compagnieDe, departParId, ligneDe, personneCourante } from '../../domain/actions.ts';
  import type { Colis, StatutColis } from '../../domain/types.ts';
  import { LIBELLE, ORDRE, suivant } from '../../core/colis.ts';
  import { quand } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { espacerCode, libelleHoraires } from '../../core/relais.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Qr from '../../ui/Qr.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { annulerColis, arriveeDepart, NOM_TAILLE, nomRelais, partager, prenomDe } from './actions.ts';
  import { boutiqueDe } from './etat.ts';
  import Pic from './Pic.svelte';

  const moi = $derived(personneCourante());
  const mesColis = $derived(moi ? [...colisDe(moi.id)].reverse() : []);
  const c = $derived<Colis | undefined>(mesColis.find((x) => x.id === param('colis')) ?? mesColis[0]);
  const paiement = $derived(c?.paiementId ? app.monde.paiements.find((p) => p.id === c.paiementId) : undefined);
  const dep = $derived(c?.departId ? departParId(c.departId) : undefined);
  const boutique = $derived(boutiqueDe(c?.relaisId));
  const prenomDest = $derived(c ? prenomDe(c.destinataire.nom) : '');
  let apercu = $state(''), confirmerAnnul = $state(false);

  const PILULE: Record<StatutColis, [string, string]> = { cree: ['créé', 'inf'], depose: ['déposé', 'inf'], en_route: ['en route', 'ok'], au_relais: ['à retirer', 'ac'], en_livraison: ['en moto', 'ac'], livre: ['livré', 'ok'], litige: ['litige', 'er'], annule: ['annulé', 'er'] };
  const ordre = $derived(c?.options.moto ? ORDRE : ORDRE.filter((s) => s !== 'en_livraison'));
  /** Dernière étape du parcours normal atteinte (un litige ou une annulation ne la déplace pas). */
  const atteint = $derived.by(() => { if (!c) return 0; const i = ordre.indexOf(c.statut); if (i >= 0) return i; const dernier = [...c.etapes].reverse().find((e) => ordre.includes(e.statut)); return dernier ? ordre.indexOf(dernier.statut) : 0; });
  function libelle(s: StatutColis, x: Colis): string {
    switch (s) {
      case 'cree': return `Créé${x.options.contreRemboursement ? ` · ${prenomDest} paiera ${fcfa(x.prix)} F` : paiement?.statut === 'ok' ? ` et payé · ${fcfa(x.prix)} F` : ' · paiement à faire'}`;
      case 'depose': return `Déposé au guichet ${x.depart.split('·')[1]?.trim() ?? ''}`.trim();
      case 'en_route': return dep ? `En route · ${compagnieDe(dep).abrev} ${dep.heure}` : LIBELLE[s];
      case 'au_relais': return `Arrivé au relais ${nomRelais(x.relaisId)}${x.statut === 'au_relais' ? ' · prêt' : ''}`;
      case 'livre': return x.options.moto ? `Livré à ${prenomDest}` : `Retiré par ${prenomDest}`;
      default: return LIBELLE[s];
    }
  }
  const frise = $derived(c ? ordre.map((s, i) => { const e = [...c.etapes].reverse().find((x) => x.statut === s); return { s, texte: libelle(s, c), t: e ? quand(e.ts, maintenant()) : '—', cls: i < atteint ? 'ok' : i === atteint && !['litige', 'annule'].includes(c.statut) ? 'cur' : i === atteint ? 'ok' : '' }; }) : []);
  const impaye = $derived(!!c && !c.options.contreRemboursement && paiement?.statut === 'attente');
  const refuse = $derived(!!c && paiement?.statut === 'refuse' && c.statut !== 'annule');
  const prochain = $derived(c ? suivant(c.statut) : null);
  const blocage = $derived(!c || !prochain ? '' : impaye || refuse ? 'Règle d’abord le paiement' : c.options.moto && c.statut === 'au_relais' ? 'Un livreur doit accepter la course' : '');
  const lienRelais = $derived(c?.relaisId ? `/relais?relais=${c.relaisId}` : '/relais');
  const peutAnnuler = $derived(!!c && c.statut === 'cree' && paiement?.statut !== 'ok');

  function envoyerWhatsApp() { if (!c || !moi) return; apercu = partager(c.id, moi.id); montrer(`Code envoyé à ${prenomDest} par WhatsApp (simulé)`, 'wa'); }
  function avancer() { if (c && !blocage) avancerColis(c.id, undefined, 'Étape avancée (démo)', moi?.id); }
  function annuler() { if (!c || !moi) return; const r = annulerColis(c.id, moi.id); confirmerAnnul = false; montrer(r.ok ? 'Colis annulé' : r.message, r.ok ? 'ok' : 'er'); }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
</script>

<Mobile titre="Mon colis" sous={c ? `${NOM_TAILLE[c.taille]} · pour ${prenomDest} · ${c.arrivee.split('·')[0].trim()}` : 'Aucun colis'} retourVers="/" dock={dockVoyageur('billets')}>
  {#snippet droite()}{#if c}<span class="pl {PILULE[c.statut][1]}"><span class="dot"></span>{PILULE[c.statut][0]}</span>{/if}{/snippet}

  {#if !c}
    <div class="center">
      <span class="ill"><Pic nom="colis" taille={64} trait={1.5} /></span>
      <span class="ttl t18">Pas encore de colis</span>
      <span class="t14 mut">Envoie un colis avec le bus : ton proche le retire dans un point relais ou le reçoit à domicile par moto.</span>
      <a class="b p" href="/colis/envoi" onclick={(e) => lien(e, '/colis/envoi')}>Envoyer un colis</a>
    </div>
  {:else}
    {#if mesColis.length > 1}
      <div class="chips" role="group" aria-label="Mes colis">
        {#each mesColis as x (x.id)}<button type="button" class="ch" class:on={x.id === c.id} aria-pressed={x.id === c.id} onclick={() => aller(`/colis/suivi?colis=${x.id}`)}>{x.code}</button>{/each}
      </div>
    {/if}

    {#if impaye}
      <div class="gl row g12 alerte"><span class="bub"><Pic nom="info" /></span><span class="col grow"><span class="t14 b7">Paiement en attente · {fcfa(c.prix)} F</span><span class="t12 mut">Le colis part après ton paiement.</span></span><a class="b p sm" style="flex: none" href="/paiement?colis={c.id}" onclick={(e) => lien(e, `/paiement?colis=${c.id}`)}>Payer</a></div>
    {:else if refuse}
      <div class="gl row g12 alerte er" role="alert"><span class="bub"><Pic nom="info" /></span><span class="col grow"><span class="t14 b7 erc">Paiement refusé</span><span class="t12 mut">{paiement?.motif ?? 'Réessaie avec un autre moyen.'}</span></span><a class="b p sm" style="flex: none" href="/paiement?colis={c.id}" onclick={(e) => lien(e, `/paiement?colis=${c.id}`)}>Réessayer</a></div>
    {:else if c.options.contreRemboursement && c.statut !== 'livre'}
      <div class="gl row g12 alerte"><span class="bub aq"><Pic nom="info" /></span><span class="col grow"><span class="t14 b7">{prenomDest} paie {fcfa(c.prix)} F à la remise</span><span class="t12 mut">Rien à régler de ton côté.</span></span></div>
    {/if}

    <div class="gl ac">
      <span class="lab c">Code du colis · à montrer au guichet</span>
      <div class="code" aria-label="Code colis {c.code}">{c.code}</div>
      <div class="qr"><Qr texte={c.code} taille={132} libelle="Code QR du colis {c.code}" /></div>
    </div>

    <div class="gl col g8">
      <div class="row sp"><span class="col"><span class="lab">Code de retrait · pour {prenomDest}</span><span class="code petit" aria-label="Code de retrait {c.codeRetrait}">{espacerCode(c.codeRetrait)}</span></span></div>
      <span class="t12 mut">{prenomDest} le donne {c.options.moto ? 'au livreur à sa porte' : `au relais ${nomRelais(c.relaisId)}`} pour recevoir le colis.</span>
      <button type="button" class="b s sm" style="width: 100%" onclick={envoyerWhatsApp}><Pic nom="whatsapp" taille={18} />Envoyer le code à {prenomDest} (WhatsApp)</button>
      {#if apercu}<p class="apercu t13" role="status">{apercu}</p>{/if}
    </div>

    <div class="row g8">
      <div class="gl grow col"><span class="lab">Arrivée</span><span class="ttl t24">{dep ? arriveeDepart(dep) : '—'}</span><span class="t12 mut">{c.statut === 'au_relais' || c.statut === 'livre' ? (boutique ? `retrait ${libelleHoraires(boutique)}` : 'au relais') : c.statut === 'en_livraison' ? 'moto en route' : dep ? (dep.retardMin ? `retard +${dep.retardMin} min` : 'prévu · à l’heure') : 'selon le bus'}</span></div>
      {#if dep && c.statut === 'en_route'}
        <a class="gl grow col" href="/direct?depart={dep.id}" onclick={(e) => lien(e, `/direct?depart=${dep.id}`)} style="text-decoration: none; color: inherit"><span class="lab">Dans le bus</span><span class="ttl t24">{compagnieDe(dep).abrev} {dep.heure.slice(0, 2)}</span><span class="t12 aq">suivre le bus · {ligneDe(dep).de} → {ligneDe(dep).vers}</span></a>
      {:else}
        <div class="gl grow col"><span class="lab">Dans le bus</span><span class="ttl t24">—</span><span class="t12 mut">{c.statut === 'cree' ? 'pas encore déposé' : c.statut === 'depose' ? 'chargé au départ' : 'arrivé'}</span></div>
      {/if}
    </div>

    <div class="gl"><ol class="tl" aria-label="Étapes du colis">
      {#each frise as e (e.s)}<li class="ev {e.cls}" aria-current={e.cls === 'cur' ? 'step' : undefined}><span>{e.texte}</span><span class="mono t12">{e.t}</span></li>{/each}
    </ol>
    {#if c.statut === 'litige' || c.statut === 'annule'}<p class="t13 erc" style="margin-top: 8px" role="status">{c.statut === 'litige' ? 'Un litige est ouvert sur ce colis : l’équipe te répond sous 24 h.' : 'Ce colis est annulé.'}</p>{/if}</div>

    <div class="row g8">
      <a class="b s" href={lienRelais} onclick={(e) => lien(e, lienRelais)}>Voir le relais</a>
      {#if c.options.moto}<a class="b s" href="/livraison?colis={c.id}" onclick={(e) => lien(e, `/livraison?colis=${c.id}`)}>Livraison moto</a>
      {:else}<a class="b s" href="/colis/envoi" onclick={(e) => lien(e, '/colis/envoi')}>Nouveau colis</a>{/if}
    </div>
    {#if prochain && c.statut !== 'litige' && c.statut !== 'annule'}
      <button type="button" class="b s sm" style="width: 100%" onclick={avancer} disabled={!!blocage} aria-describedby={blocage ? 'bloc' : undefined}>Avancer (démo) · {LIBELLE[prochain]}</button>
      {#if blocage}<span id="bloc" class="t12 mut c">{blocage}</span>{/if}
    {/if}
    {#if peutAnnuler}
      {#if confirmerAnnul}<div class="row g8"><button type="button" class="b d sm" onclick={annuler}>Oui, annuler le colis</button><button type="button" class="b g sm" onclick={() => (confirmerAnnul = false)}>Garder</button></div>
      {:else}<button type="button" class="b g sm" onclick={() => (confirmerAnnul = true)}>Annuler ce colis</button>{/if}
    {/if}
    <a class="b g" href="/litige?colis={c.id}" onclick={(e) => lien(e, `/litige?colis=${c.id}`)}>Colis abîmé ou en retard ? Signaler</a>
  {/if}
</Mobile>

<style>
  .code { font: 700 30px 'Geist Mono', monospace; letter-spacing: 0.06em; text-align: center; }
  .code.petit { font-size: 24px; text-align: left; letter-spacing: 0.12em; }
  .qr { display: grid; place-items: center; margin-top: 8px; } .qr :global(svg) { border-radius: 14px; }
  .alerte { border-color: rgba(255, 194, 75, 0.4); } .alerte.er { border-color: rgba(255, 107, 107, 0.5); }
  .apercu { padding: 10px 12px; border-radius: 14px; background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); }
  .tl { position: relative; padding-left: 30px; display: flex; flex-direction: column; list-style: none; margin: 0; }
  .tl:before { content: ''; position: absolute; left: 11px; top: 14px; bottom: 14px; width: 2px; background: rgba(255, 255, 255, 0.12); }
  .ev { position: relative; display: flex; justify-content: space-between; gap: 8px; min-height: 48px; padding: 6px 0; color: #b7c0db; }
  .ev:before { content: ''; position: absolute; left: -25px; top: 14px; width: 14px; height: 14px; border-radius: 50%; background: #05070d; border: 3px solid rgba(255, 255, 255, 0.3); }
  .ev.ok { color: #a1accb; } .ev.ok:before { background: #4ade80; border-color: #4ade80; }
  .ev.cur { color: #f2f4ff; font-weight: 600; } .ev.cur:before { background: #3de0ff; border-color: #3de0ff; box-shadow: 0 0 14px #3de0ff; }
  button:disabled { opacity: 0.5; }
  button:focus-visible, a:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
</style>
