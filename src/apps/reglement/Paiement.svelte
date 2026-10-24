<script lang="ts">
  import { tick } from 'svelte';
  import { aller, param } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { compagnieDe, departParId, gare, heureLocale, ligneDe, personne, personneCourante, prixDuDepart } from '../../domain/actions.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { supplementSiege } from '../../core/sieges.ts';
  import { formaterExpiration, formaterNumeroCarte, formaterTel, OPERATEURS, telValide, validerCarte, type Carte, type MoyenChoisi } from '../../core/reglement.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { placesRestantes } from '../../core/covoit.ts';
  import { brouillonVide, cagnotte, etat, type Brouillon } from './etat.ts';
  import { avantagesDe, colisDuBrouillon, lancerPaiement, libererReservation, montantBrouillon, offreCovoit, partCagnotte, paiementActif, paiementDe, purgerBrouillonTermine, remiseDe, reprendreColis, reprendrePaiement } from './actions.ts';
  import { preparerFidelite } from '../entree/actions.ts';

  /** Récapitulatif et choix du moyen (MoMo, Orange Money, carte, visage), puis `reserver()` et attente de confirmation. Billet, covoiturage (?covoit=) ou part de cagnotte (?groupe=1). */
  const e = etat(), moi = personneCourante();
  purgerBrouillonTermine();
  if (moi) preparerFidelite(moi.id);
  /** `?paiement=<id>` : paiement déjà créé ailleurs (montée en route, places bloquées au guichet…) que l'on règle ici. */
  const reprise: string | null = param('paiement') && moi ? reprendrePaiement(param('paiement')!, moi.id) : param('colis') && moi ? reprendreColis(param('colis')!, moi.id) : null;
  const repriseKo = reprise !== null && reprise !== 'ok';
  const natureDemandee = param('covoit') ? 'covoit' : param('groupe') ? 'groupe' : param('colis') ? 'colis' : 'billet';

  // ---- préparation du brouillon selon l'origine
  if (natureDemandee === 'covoit') {
    const id = param('covoit'), a = e.brouillon;
    if (!(a?.nature === 'covoit' && a.covoitId === id)) { if (a) libererReservation(a); e.brouillon = brouillonVide({ nature: 'covoit', covoitId: id, places: 1, tel: moi?.tel ?? '' }); }
  } else if (natureDemandee === 'groupe') {
    const a = e.brouillon;
    if (a?.nature !== 'groupe') { if (a) libererReservation(a); e.brouillon = brouillonVide({ nature: 'groupe', tel: moi?.tel ?? '', montant: partCagnotte(cagnotte()) }); }
    else a.montant = partCagnotte(cagnotte());
  } else if (e.brouillon?.nature === 'billet' && e.brouillon.qui !== 'moi') {
    // retour depuis « Pour un proche » : la voyageuse règle elle-même, la première place redevient la sienne
    const a = e.brouillon; if (moi && a.passagers[0] && a.proche && a.passagers[0].tel === a.proche.tel) a.passagers[0] = { nom: `${moi.prenom} ${moi.nom}`, tel: moi.tel };
    a.qui = 'moi'; a.proche = null;
  }
  const b = $derived(e.brouillon as Brouillon | null);
  const depart = $derived(b?.nature === 'billet' && b.departId ? departParId(b.departId) : undefined);
  const ligne = $derived(depart ? ligneDe(depart) : undefined);
  const offre = $derived(b?.nature === 'covoit' ? offreCovoit(b.covoitId) : undefined);
  const colis = $derived(b?.nature === 'colis' ? colisDuBrouillon(b) : undefined);
  const conducteur = $derived(offre ? personne(offre.conducteurId) : undefined);
  const brut = $derived(b ? montantBrouillon(b) : 0);
  const remise = $derived(remiseDe(b, moi?.id));
  const total = $derived(brut - remise.total);
  const dispo = $derived(avantagesDe(moi?.id));
  const avantagesPossibles = $derived(b?.nature === 'billet' && b.qui === 'moi' && (dispo.bons.length > 0 || dispo.cagnotte > 0));
  const retenue = $derived(b ? paiementDe(b) : undefined);
  /** Places encore libres, en comptant comme libres celles que cette réservation en attente retient déjà. */
  const restantes = $derived(offre ? placesRestantes(offre) + (retenue && paiementActif(retenue) ? b!.places : 0) : 0);

  const b0 = e.brouillon;
  let telMomo = $state(b0?.moyen === 'momo' && b0.tel ? b0.tel : (moi?.tel ?? '691221008'));
  let telOm = $state(b0?.moyen === 'om' && b0.tel ? b0.tel : '699405112');
  let carte = $state<Carte>({ numero: '', expiration: '', cvc: '', titulaire: moi ? `${moi.prenom} ${moi.nom}`.toUpperCase() : '' });
  let carteTentee = $state(false);
  let face = $state<'repos' | 'scan' | 'ok'>(b0?.visageOk ? 'ok' : 'repos');
  let erreur = $state(''), erreurSiege = $state(false), envoi = $state(false);
  const erreursCarte = $derived(validerCarte(carte, maintenant()));
  const moyen = $derived((b?.moyen ?? 'momo') as MoyenChoisi);
  const visagePossible = !!moi?.visage;

  function choisir(m: MoyenChoisi) { if (!b || (m === 'visage' && !visagePossible)) return; b.moyen = m; erreur = ''; }
  function scanner() {
    if (!b || face !== 'repos') return;
    face = 'scan'; setTimeout(() => { face = 'ok'; if (e.brouillon) e.brouillon.visageOk = true; }, 1400);
  }
  const numeroCourant = $derived(moyen === 'om' ? telOm : telMomo);
  const pret = $derived(!!b && total > 0 && !envoi && (moyen === 'visage' ? face === 'ok' : moyen === 'carte' ? true : telValide(numeroCourant)));
  const libelleErreur: Record<string, string> = {
    siege_pris: 'Une de tes places vient d’être prise par un autre voyageur. Choisis-en une autre.', complet: 'Il n’y a plus assez de places libres.',
    depart_ferme: 'Ce départ n’accepte plus de réservation.', depart_inconnu: 'Ce départ n’existe plus.', offre_fermee: 'Cette offre de covoiturage est fermée.', offre_inconnue: 'Cette offre n’existe plus.', demande_invalide: 'Réservation incomplète.'
  };
  const montrerErreur = () => void tick().then(() => document.getElementById('err-paiement')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  function payer() {
    if (!b || !moi) return; erreur = ''; erreurSiege = false;
    if (moyen === 'carte') { carteTentee = true; if (Object.keys(erreursCarte).length) { erreur = 'Vérifie les champs de la carte.'; montrerErreur(); return; } }
    else if (moyen !== 'visage' && !telValide(numeroCourant)) { erreur = 'Numéro invalide : 9 chiffres, il commence par 6.'; montrerErreur(); return; }
    if (moyen === 'visage' && face !== 'ok') { erreur = 'Confirme d’abord par le visage.'; montrerErreur(); return; }
    b.tel = moyen === 'om' ? telOm : moyen === 'carte' ? moi.tel : telMomo;
    envoi = true;
    try { lancerPaiement(b, moi.id); aller('/paiement/attente'); }
    catch (err) { const code = err instanceof Error ? err.message : ''; erreur = libelleErreur[code] ?? 'Impossible de réserver pour le moment.'; erreurSiege = code === 'siege_pris' || code === 'complet'; envoi = false; montrerErreur(); }
  }
  const titre = $derived(!b ? '' : b.nature === 'colis' ? `Colis ${colis?.code ?? ''}` : b.nature === 'covoit' ? `Covoiturage · ${conducteur?.prenom ?? ''} ${offre?.heure ?? ''}` : b.nature === 'groupe' ? `Cagnotte · ${cagnotte().motif}` : `${b.sansSiege ? 'Sans siège attribué' : `${b.sieges.length > 1 ? 'Places' : 'Place'} ${b.sieges.join(', ')}`} · ${depart ? compagnieDe(depart).nom : ''} ${depart?.heure ?? ''}`);
  const sortieVide = $derived(param('colis') ? '/colis/suivi' : reprise === 'deja_regle' ? '/pass' : natureDemandee === 'covoit' ? '/covoit' : '/');
  const retour = $derived(b?.nature === 'colis' ? `/colis/suivi?colis=${b.colisId}` : b?.nature === 'covoit' ? '/covoit' : b?.nature === 'groupe' ? '/groupe' : b?.departId ? `/siege?depart=${b.departId}` : '/');
  const methodes = $derived<{ id: MoyenChoisi; sous: string }[]>([
    { id: 'momo', sous: `${formaterTel(telMomo)} · ${moi?.prenom ?? ''}` }, { id: 'om', sous: formaterTel(telOm) },
    { id: 'carte', sous: carte.numero ? `Carte •••• ${carte.numero.replace(/\D/g, '').slice(-4)}` : 'Visa, Mastercard' },
    { id: 'visage', sous: visagePossible ? 'Face ID · aucun code à taper' : 'Non activé sur ce compte' }
  ]);
</script>

<Mobile titre="Paiement" sous={titre} retourVers={retour}>
  {#snippet droite()}<span class="pl ok">sécurisé</span>{/snippet}

  {#if repriseKo || !b || total <= 0 || (b.nature === 'billet' && (!depart || !ligne || (b.sieges.length === 0 && !b.sansSiege))) || (b.nature === 'covoit' && !offre) || (b.nature === 'colis' && !colis)}
    <div class="center"><span class="ill" aria-hidden="true"><Icone nom="billet" taille={56} /></span>
      <span class="ttl t20">{repriseKo ? 'Ce paiement n’est plus en attente' : 'Rien à payer pour l’instant'}</span>
      <span class="t14 mut" style="max-width: 30ch">{reprise === 'deja_regle' ? (param('colis') ? 'Ce colis est déjà payé : suis-le depuis ta liste.' : 'Ce billet est déjà réglé : retrouve-le dans tes billets.') : reprise === 'annule' ? 'Ce colis a été annulé.' : reprise === 'sans_paiement' ? 'Le destinataire paie à la remise : rien à régler maintenant.' : reprise === 'expire' ? 'La réservation a expiré et la place a été libérée. Choisis-la de nouveau.' : repriseKo ? 'Ce paiement est introuvable.' : b?.nature === 'covoit' ? 'Cette offre de covoiturage n’est plus disponible.' : 'Choisis d’abord ta place dans un bus, puis reviens payer.'}</span>
      <a class="b p" href={sortieVide} onclick={(ev) => { ev.preventDefault(); aller(sortieVide); }}>{param('colis') ? 'Voir mes colis' : reprise === 'deja_regle' ? 'Voir mes billets' : natureDemandee === 'covoit' ? 'Voir les covoiturages' : 'Voir les départs'}</a></div>
  {:else}
    {#if b.refus}
      <div class="toast" role="status"><span class="bub" style="color: #FF6B6B"><Icone nom="alerte" /></span><span class="t13 grow">Refusé avec {OPERATEURS[b.refus.moyen].court} : {b.refus.motif}. Choisis un autre moyen.</span></div>
    {/if}
    <div class="gl ac col g8">
      <span class="lab">À payer</span><span class="big" aria-label="{total} francs CFA">{fmtF(total)}</span>
      <span class="t12 mut">{b.nature === 'billet' ? 'remboursable jusqu’à 2 h avant le départ (10 % de frais)' : b.nature === 'colis' ? 'à régler maintenant · le colis part après ton paiement, dépose-le au guichet' : b.nature === 'covoit' ? 'à régler maintenant, places gardées 10 min' : `ta part de la cagnotte · remboursée à J-2 si le bus n’est pas plein`}</span>
    </div>

    <div class="gl col" style="gap: 0">
      {#if b.nature === 'billet' && depart && ligne}
        <div class="li"><span class="bub aq"><Icone nom="bus" /></span><span class="col grow"><span class="t14 b7">{ligne.de} → {ligne.vers}</span><span class="t12 mut">{jourSemaineCourt(depart.jour)} {depart.heure} · {gare(ligne.gareDe)?.nom} → {gare(ligne.gareVers)?.nom} · {ligne.classe}{depart.retardMin ? ` · +${depart.retardMin} min` : ''}</span></span></div>
        {#if b.sansSiege}
          {#each b.passagers as pa, i (i)}<div class="li"><span class="col grow"><span class="t14 b7">{pa.nom}</span><span class="t12 mut">place libre · tu montes avec ton code</span></span><span class="mono b7">{fmtF(b.prixUnitaire ?? 0)}</span></div>{/each}
        {/if}
        {#each b.sansSiege ? [] : b.sieges as s, i (s)}
          {@const sup = supplementSiege(ligne.classe, s)}
          <div class="li"><span class="col grow"><span class="t14 b7">{b.passagers[i]?.nom}</span><span class="t12 mut">place {s}{sup ? ' · confort' : ''}</span></span><span class="mono b7">{fmtF(prixDuDepart(depart) + sup)}</span></div>
        {/each}
        <div class="li"><span class="grow t14 mut">Frais de service AfriMove</span><span class="mono b7 okc">offerts</span></div>
        {#if remise.total > 0}<div class="li" data-testid="remise"><span class="grow t14 mut">{[remise.bons ? `Bon de fidélité${remise.bons > 1 ? 's' : ''}` : '', remise.cagnotte ? 'Cagnotte' : ''].filter(Boolean).join(' + ')}</span><span class="mono b7 okc">−{fmtF(remise.total)}</span></div>{/if}
      {:else if b.nature === 'colis' && colis}
        <div class="li"><span class="bub aq"><Icone nom="colis" /></span><span class="col grow"><span class="t14 b7">Colis {colis.code} · {colis.taille === 'S' ? 'enveloppe' : colis.taille === 'M' ? 'carton' : 'sac'} {colis.taille}</span><span class="t12 mut">{colis.depart} → {colis.arrivee} · pour {colis.destinataire.nom}</span></span><span class="mono b7">{fmtF(colis.prix)}</span></div>
        {#if colis.options.assurance || colis.options.moto}<div class="li"><span class="grow t14 mut">{[colis.options.moto ? 'livraison moto' : '', colis.options.assurance ? 'assurance 50 000 F' : ''].filter(Boolean).join(' · ')}</span><span class="mono b7 okc">inclus</span></div>{/if}
      {:else if b.nature === 'covoit' && offre}
        <div class="li"><span class="bub aq"><Icone nom="taxi" /></span><span class="col grow"><span class="t14 b7">{offre.de} → {offre.vers}</span><span class="t12 mut">{jourSemaineCourt(offre.jour)} {offre.heure} · {offre.depart} · {offre.vehicule} · {conducteur?.prenom}</span></span></div>
        <div class="li"><span class="col grow"><span class="t14 b7">Places</span><span class="t12 mut">{fmtF(offre.prix)} la place · {restantes} disponible{restantes > 1 ? 's' : ''}</span></span>
          <span class="row g8"><button type="button" class="ib" aria-label="Une place de moins" disabled={b.places <= 1 || !!retenue} onclick={() => (b.places = Math.max(1, b.places - 1))}>−</button><span class="mono b7" aria-live="polite">{b.places}</span><button type="button" class="ib" aria-label="Une place de plus" disabled={b.places >= restantes || !!retenue} onclick={() => (b.places = Math.min(restantes, b.places + 1))}>+</button></span></div>
      {:else}
        <div class="li"><span class="bub aq"><Icone nom="groupe" /></span><span class="col grow"><span class="t14 b7">{cagnotte().motif}</span><span class="t12 mut">Bus de {cagnotte().taille} places · ma part</span></span><span class="mono b7">{fmtF(total)}</span></div>
      {/if}
    </div>

    {#if retenue && paiementActif(retenue)}
      <span class="t12 mut c">{b?.nature === 'billet' || b?.nature === 'covoit' ? 'Places retenues' : 'Paiement attendu'} jusqu’à {heureLocale(retenue.expireLe ?? 0)}.</span>
    {/if}

    {#if avantagesPossibles && b}
      <div class="gl row g12" style="align-items: center; min-height: 56px"><span class="col grow" id="lab-av"><span class="t14 b7">Utiliser mes avantages</span><span class="t12 mut">{[dispo.bons.length ? `${dispo.bons.length} bon${dispo.bons.length > 1 ? 's' : ''} de ${fmtF(dispo.bons[0])}` : '', dispo.cagnotte > 0 ? `cagnotte ${fmtF(dispo.cagnotte)}` : ''].filter(Boolean).join(' · ')}</span></span>
        <button type="button" class="sw" class:on={b.avantages !== false} role="switch" aria-checked={b.avantages !== false} aria-labelledby="lab-av" onclick={() => { if (b) b.avantages = b.avantages === false; }}></button></div>
    {/if}

    <span class="lab" id="lab-moyen">Moyen de paiement</span>
    <div class="col g8" role="radiogroup" aria-labelledby="lab-moyen">
      {#each methodes as m (m.id)}
        {@const op = OPERATEURS[m.id]}
        <button type="button" class="pm" class:on={moyen === m.id} role="radio" aria-checked={moyen === m.id} disabled={m.id === 'visage' && !visagePossible} onclick={() => choisir(m.id)}>
          <span class="lg" style="background: {op.couleur}" aria-hidden="true">{op.abrev}</span>
          <span class="col grow"><span class="t15 b7">{op.nom}</span><span class="t12 mut">{m.sous}</span></span>
          <span class="pl {m.id === 'carte' ? 'inf' : 'ok'}">{op.delai}</span>
        </button>
      {/each}
    </div>

    {#if moyen === 'momo' || moyen === 'om'}
      <div class="fld">
        <label class="t13 mut" for="tel-mm">Numéro {OPERATEURS[moyen].court}</label>
        {#if moyen === 'momo'}<input id="tel-mm" class="inp" inputmode="tel" autocomplete="tel" bind:value={telMomo} aria-invalid={!telValide(telMomo)} aria-describedby="aide-tel" />
        {:else}<input id="tel-mm" class="inp" inputmode="tel" autocomplete="off" bind:value={telOm} aria-invalid={!telValide(telOm)} aria-describedby="aide-tel" />{/if}
        <span id="aide-tel" class="t12 mut3">9 chiffres. Démo : un numéro qui se termine par 00 est refusé (solde insuffisant).</span>
      </div>
    {:else if moyen === 'carte'}
      <div class="gl col g8">
        <div class="fld"><label class="t13 mut" for="cb-num">Numéro de carte</label><input id="cb-num" class="inp mono" inputmode="numeric" autocomplete="cc-number" placeholder="4111 1111 1111 1111" value={carte.numero} oninput={(ev) => (carte.numero = formaterNumeroCarte(ev.currentTarget.value))} aria-invalid={carteTentee && !!erreursCarte.numero} />{#if carteTentee && erreursCarte.numero}<span class="t12 erc" role="alert">{erreursCarte.numero}</span>{/if}</div>
        <div class="row g8">
          <div class="fld grow"><label class="t13 mut" for="cb-exp">Expiration</label><input id="cb-exp" class="inp mono" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" value={carte.expiration} oninput={(ev) => (carte.expiration = formaterExpiration(ev.currentTarget.value))} aria-invalid={carteTentee && !!erreursCarte.expiration} />{#if carteTentee && erreursCarte.expiration}<span class="t12 erc" role="alert">{erreursCarte.expiration}</span>{/if}</div>
          <div class="fld grow"><label class="t13 mut" for="cb-cvc">Code</label><input id="cb-cvc" class="inp mono" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4" bind:value={carte.cvc} aria-invalid={carteTentee && !!erreursCarte.cvc} />{#if carteTentee && erreursCarte.cvc}<span class="t12 erc" role="alert">{erreursCarte.cvc}</span>{/if}</div>
        </div>
        <div class="fld"><label class="t13 mut" for="cb-nom">Titulaire</label><input id="cb-nom" class="inp" autocomplete="cc-name" bind:value={carte.titulaire} aria-invalid={carteTentee && !!erreursCarte.titulaire} />{#if carteTentee && erreursCarte.titulaire}<span class="t12 erc" role="alert">{erreursCarte.titulaire}</span>{/if}</div>
        <span class="t12 mut3">Démo : 4111 1111 1111 1111, une date future, 3 chiffres. Aucune donnée n’est envoyée.</span>
      </div>
    {:else}
      <button class="face" class:ok={face === 'ok'} class:scan={face === 'scan'} type="button" onclick={scanner} aria-label={face === 'ok' ? 'Visage reconnu' : face === 'scan' ? 'Analyse du visage en cours' : 'Confirmer par le visage'}>
        <Icone nom="visage" taille={52} trait={1.6} />
      </button>
      <span class="t13 mut c" role="status">{face === 'ok' ? 'Reconnue · aucun code à taper' : face === 'scan' ? 'Analyse en cours…' : 'Touche le cadre pour confirmer par le visage'}</span>
    {/if}

    {#if erreur}
      <div class="col g8" id="err-paiement"><span class="t13 erc" role="alert">{erreur}</span>
        {#if erreurSiege && b.nature === 'billet' && b.departId}<a class="b s sm" href="/siege?depart={b.departId}" onclick={(ev) => { ev.preventDefault(); aller(`/siege?depart=${b.departId}`); }}>Changer de place</a>{/if}</div>
    {/if}
  {/if}

  {#snippet bas()}
    {#if b && total > 0}
      <div class="bas">
        <button type="button" class="b p" disabled={!pret} onclick={payer}>{envoi ? 'Réservation…' : `Payer ${fmtF(total)}`}</button>
        {#if b.nature === 'billet' && b.departId}<a class="b g" href="/proche?depart={b.departId}" onclick={(ev) => { ev.preventDefault(); aller(`/proche?depart=${b.departId}`); }}>Quelqu’un paie pour moi</a>{/if}
      </div>
    {/if}
  {/snippet}
</Mobile>

<style>
  .pm { flex: none; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; min-height: 64px; }
  .pm.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.25), rgba(61, 224, 255, 0.15)); border-color: #8b7cff; }
  .pm:disabled { opacity: 0.45; cursor: not-allowed; }
  .pm:focus-visible, .face:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .lg { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font: 800 11px 'Sora Variable', 'Sora', sans-serif; letter-spacing: -0.03em; color: #06080f; flex: none; overflow: hidden; }
  .face { position: relative; flex: none; width: 118px; height: 118px; margin: 0 auto; border-radius: 38px; border: 2px solid rgba(255, 255, 255, 0.2); display: grid; place-items: center; background: rgba(255, 255, 255, 0.06); overflow: hidden; cursor: pointer; }
  .face::before { content: ''; position: absolute; inset: 0; background: conic-gradient(from 0deg, transparent 70%, #3de0ff); opacity: 0.6; }
  .face.scan::before { animation: tourne 1.2s linear infinite; }
  .face::after { content: ''; position: absolute; inset: 3px; border-radius: 34px; background: #0b1020; }
  .face :global(svg) { position: relative; z-index: 1; color: #7febff; }
  .face.ok::before { background: rgba(74, 222, 128, 0.25); } .face.ok :global(svg) { color: #4ade80; }
  @keyframes tourne { to { transform: rotate(360deg); } }
  .bas .b.g { min-height: 44px; }
  .bas { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px 18px; border-radius: 28px 28px 0 0; background: rgba(10, 14, 28, 0.94); border-top: 1px solid rgba(255, 255, 255, 0.14); backdrop-filter: blur(20px); }
  .b:disabled, .ib:disabled { opacity: 0.45; cursor: not-allowed; }
  .t15 { font-size: 15px; }
  .inp:focus-visible { outline: 2px solid #7febff; outline-offset: 1px; } .inp[aria-invalid='true'] { border-color: #ff6b6b; }
</style>
