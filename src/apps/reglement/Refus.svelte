<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { gare, ligneDe, departParId, personneCourante } from '../../domain/actions.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { autreMoyen, chrono, formaterTel, MOTIF_SOLDE, OPERATEURS } from '../../core/reglement.ts';
  import { onMount } from 'svelte';
  import { etat } from './etat.ts';
  import { bloquerPourGuichet, paiementActif, paiementDe } from './actions.ts';

  /** Paiement refusé : explique, dit si les places sont encore gardées et propose un autre moyen, un proche ou le guichet. */
  const e = etat(), moi = personneCourante();
  let tic = $state(maintenant()), erreur = $state('');
  const b = $derived(e.brouillon), refus = $derived(b?.refus ?? null);
  const op = $derived(refus ? OPERATEURS[refus.moyen] : OPERATEURS.momo);
  const expire = $derived(refus?.motif === 'Réservation expirée');
  const gardee = $derived(b ? paiementActif(paiementDe(b), tic) : false);
  const fin = $derived(paiementDe(b)?.expireLe ?? 0);
  const depart = $derived(b?.departId ? departParId(b.departId) : undefined);
  const gareNom = $derived(depart ? (gare(ligneDe(depart).gareDe)?.nom ?? 'la gare') : 'la gare');
  const autre = $derived(refus ? autreMoyen(refus.moyen) : 'om');
  const telAutre = $derived(autre === 'om' ? '699405112' : (moi?.tel ?? '691221008'));
  const titre = $derived(!refus ? '' : expire ? 'Réservation expirée' : refus.motif === MOTIF_SOLDE ? `Solde ${op.court} insuffisant` : refus.motif);
  const explication = $derived(!refus ? '' : expire ? 'Les 10 minutes sont passées. Rien n’a été débité et les places ont été libérées.'
    : `${op.operateur} a répondu « ${refus.motif.toLowerCase()} ». Rien n’a été débité.${gardee && b?.nature === 'billet' ? ` Ta place ${b.sieges.join(', ')} est gardée.` : refus.nature === 'billet' ? ' Les places ne sont plus gardées.' : ''}`);
  onMount(() => { const t = setInterval(() => (tic = maintenant()), 1000); return () => clearInterval(t); });

  const lienPaiement = $derived(!b ? '/' : b.nature === 'colis' ? `/paiement?colis=${b.colisId}` : b.nature === 'covoit' ? `/paiement?covoit=${b.covoitId}` : b.nature === 'groupe' ? '/paiement?groupe=1' : `/paiement?depart=${b.departId}`);
  function reessayer() {
    if (!b) return; b.moyen = autre; b.tel = telAutre; b.visageOk = false; aller(lienPaiement);
  }
  function guichet() {
    if (!b || !moi) return;
    try { const bs = bloquerPourGuichet(b, moi.id); const id = bs[0]?.id; e.brouillon = null; montrer('Places bloquées 2 h · paie à la gare', 'ok'); aller(`/pass?billet=${id}`); }
    catch { erreur = 'Impossible de bloquer ces places : elles ont été prises. Choisis-en d’autres.'; }
  }
  const nav = (ev: Event, vers: string) => { ev.preventDefault(); aller(vers); };
</script>

<Mobile titre="Paiement refusé" retourVers="/paiement">
  {#snippet droite()}<span class="pl er">échec</span>{/snippet}

  {#if !b || !refus}
    <div class="center"><span class="ill" aria-hidden="true"><Icone nom="info" taille={56} /></span>
      <span class="ttl t20">Aucun paiement refusé</span>
      <span class="t14 mut" style="max-width: 30ch">Tout va bien : il n’y a rien à reprendre ici.</span>
      <a class="b p" href="/pass" onclick={(ev) => nav(ev, '/pass')}>Mes billets</a></div>
  {:else}
    <div class="center" style="flex: none">
      <span class="ill er" aria-hidden="true"><Icone nom="fermer" taille={64} trait={2.2} /></span>
      <span class="ttl t20">{titre}</span>
      <span class="t14 mut" style="max-width: 30ch">{explication}</span>
      {#if gardee}<span class="pl wa" role="timer"><span class="dot"></span>place gardée · {chrono(fin - tic)}</span>{/if}
    </div>

    {#if expire && b.nature === 'billet' && b.departId}
      <div class="col g8" style="margin-top: auto">
        <a class="b p" href="/siege?depart={b.departId}" onclick={(ev) => nav(ev, `/siege?depart=${b.departId}`)}>Choisir à nouveau</a>
        <a class="b g" href="/" onclick={(ev) => nav(ev, '/')}>Voir d’autres départs</a>
      </div>
    {:else}
      <span class="lab">Que faire</span>
      <button type="button" class="bn ac" onclick={reessayer}><span class="bub aq"><Icone nom="retour" /></span><span class="col grow"><span class="t15 b7">Réessayer avec {OPERATEURS[autre].nom}</span><span class="t12 mut">{formaterTel(telAutre)} · {OPERATEURS[autre].delai}</span></span></button>
      {#if b.nature === 'billet' && b.departId}
        <a class="bn" href="/proche?depart={b.departId}" onclick={(ev) => nav(ev, `/proche?depart=${b.departId}`)}><span class="bub"><Icone nom="groupe" /></span><span class="col grow"><span class="t15 b7">Demander à un proche de payer</span><span class="t12 mut">Maman, Paul… un lien WhatsApp, il paie, tu voyages</span></span></a>
        <button type="button" class="bn" onclick={guichet}><span class="bub"><Icone nom="argent" /></span><span class="col grow"><span class="t15 b7">Réserver, payer au guichet</span><span class="t12 mut">Places bloquées 2 h · paiement en espèces à {gareNom}</span></span></button>
      {/if}
      {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
      <div class="col g8" style="margin-top: auto">
        <a class="b p" href={lienPaiement} onclick={(ev) => nav(ev, lienPaiement)}>Changer de moyen de paiement</a>
        <a class="b g" href="/litige?paiement={refus.paiementId ?? ''}" onclick={(ev) => nav(ev, `/litige?paiement=${refus.paiementId ?? ''}`)}>J’ai pourtant été débitée</a>
      </div>
    {/if}
  {/if}
</Mobile>

<style>
  .t15 { font-size: 15px; }
  .bn { flex: none; }
  .bn:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
</style>
