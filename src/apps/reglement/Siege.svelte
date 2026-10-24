<script lang="ts">
  import { aller, param } from '../../router.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { compagnieDe, departParId, gare, ligneDe, personneCourante, placesLibres, siegesIndisponibles } from '../../domain/actions.ts';
  import { planSieges, supplementSiege, SUPPLEMENT_DEVANT } from '../../core/sieges.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { duree } from '../../core/tranches.ts';
  import { colonneEcran, formaterTel, MAX_PASSAGERS, meilleurSiege, telValide, type CritereSiege } from '../../core/reglement.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import type { Passager } from '../../domain/types.ts';
  import { brouillonVide, etat } from './etat.ts';
  import { libererReservation, purgerBrouillonTermine, siegesRetenus, totalBillets } from './actions.ts';

  /** Plan du bus en 3D : choisir 1 à 6 places, un passager par place, puis payer (ou faire payer un proche). */
  const e = etat(), moi = personneCourante();
  purgerBrouillonTermine();
  const departId = $derived(param('depart'));
  const depart = $derived(departId ? departParId(departId) : undefined);
  const ligne = $derived(depart ? ligneDe(depart) : undefined);
  const plan = $derived(depart && ligne ? planSieges(ligne.classe, depart.capacite) : []);
  const moiNom = moi ? `${moi.prenom} ${moi.nom}` : 'Voyageur', moiTel = moi?.tel ?? '';

  const reprise = e.brouillon?.nature === 'billet' && e.brouillon.departId === param('depart') ? e.brouillon : null;
  let choisis = $state<string[]>(reprise ? [...reprise.sieges] : []);
  let passagers = $state<Passager[]>(reprise ? reprise.passagers.map((p, i) => (i === 0 ? { nom: moiNom, tel: moiTel } : { ...p })) : []);
  let erreur = $state('');

  const retenus = $derived(e.brouillon?.departId === departId ? siegesRetenus(e.brouillon) : []);
  const indispo = $derived.by(() => { if (!depart) return new Set<string>(); const s = new Set(siegesIndisponibles(depart)); for (const r of retenus) s.delete(r); return s; });
  const libres = $derived(depart ? Math.max(0, placesLibres(depart) + retenus.length) : 0);
  const rangees = $derived(ligne ? Math.ceil(plan.length / (ligne.classe === 'VIP' ? 3 : 4)) : 0);
  let deck = $state<HTMLElement | null>(null), hauteurDeck = $state(420);
  // Le plan est incliné en 3D : on mesure sa hauteur à l'écran pour réserver la bonne place dans la page.
  $effect(() => { void rangees; void ligne?.classe; if (deck) hauteurDeck = Math.ceil(deck.getBoundingClientRect().height) + 26; });
  const ferme = $derived(!depart || depart.statut === 'annule' || depart.statut === 'parti' || depart.statut === 'arrive');
  const total = $derived(departId ? totalBillets(departId, choisis) : 0);
  const siegeCourant = $derived(plan.find((s) => s.id === choisis[choisis.length - 1]));

  // Une place qu'un autre voyageur vient de prendre quitte la sélection.
  $effect(() => {
    const perdus = choisis.filter((id) => indispo.has(id));
    if (perdus.length) { for (const id of perdus) retirer(id); montrer(`Place ${perdus.join(', ')} prise entre-temps`, 'wa'); }
  });

  function retirer(id: string) { const i = choisis.indexOf(id); if (i < 0) return; choisis.splice(i, 1); passagers.splice(i, 1); }
  function ajouter(id: string) {
    if (choisis.length >= MAX_PASSAGERS) { montrer(`${MAX_PASSAGERS} places au maximum par réservation`, 'wa'); return; }
    choisis.push(id); passagers.push(choisis.length === 1 ? { nom: moiNom, tel: moiTel } : { nom: '', tel: '' });
  }
  function basculer(id: string) { erreur = ''; if (indispo.has(id)) return; if (choisis.includes(id)) retirer(id); else ajouter(id); }
  function rapide(critere: CritereSiege) {
    const id = meilleurSiege(plan, indispo, critere, choisis);
    if (!id) { montrer('Plus de place de ce type', 'wa'); return; }
    erreur = ''; ajouter(id);
  }
  function probleme(): string {
    if (!choisis.length) return 'Choisis au moins une place.';
    for (let i = 1; i < passagers.length; i++) {
      if (passagers[i].nom.trim().length < 2) return `Passager ${i + 1} : écris son nom.`;
      if (!telValide(passagers[i].tel)) return `Passager ${i + 1} : numéro camerounais à 9 chiffres (6…).`;
    }
    return '';
  }
  function continuer(versProche: boolean) {
    if (!departId) return;
    if (!choisis.length) { montrer('Choisis d’abord une place', 'wa'); return; }
    erreur = probleme(); if (erreur) return;
    const ancien = e.brouillon;
    if (ancien && (ancien.nature !== 'billet' || ancien.departId !== departId)) libererReservation(ancien);
    const memeDepart = ancien?.nature === 'billet' && ancien.departId === departId ? ancien : null;
    e.brouillon = brouillonVide({
      nature: 'billet', departId, sieges: [...choisis], passagers: passagers.map((p) => ({ nom: p.nom.trim(), tel: p.tel.trim() })),
      moyen: memeDepart?.moyen ?? 'momo', tel: memeDepart?.tel || moiTel, visageOk: memeDepart?.visageOk ?? false, paiementId: memeDepart?.paiementId ?? null
    });
    aller(versProche ? `/proche?depart=${departId}` : `/paiement?depart=${departId}`);
  }
  const cote = (id: string) => (plan.find((s) => s.id === id)?.fenetre ? 'côté fenêtre' : 'côté couloir');
  const etatSiege = (id: string) => (indispo.has(id) ? 'prise' : choisis.includes(id) ? 'choisie' : 'libre');
  const trajet = $derived(ligne ? `${ligne.vers} ${gare(ligne.gareVers)?.nom ?? ''}`.trim() : '');
</script>

<Mobile titre="Choisis ta place" sous={depart && ligne ? `${compagnieDe(depart).nom} · ${depart.heure} · ${trajet}` : 'Plan du bus'} retourVers="/">
  {#snippet droite()}{#if depart && !ferme}<span class="pl {libres <= 4 ? 'wa' : 'ok'}">{libres} libre{libres > 1 ? 's' : ''}</span>{/if}{/snippet}

  {#if !departId || !depart || !ligne}
    <div class="center"><span class="ill" aria-hidden="true"><Icone nom="bus" taille={56} /></span>
      <span class="ttl t20">{departId ? 'Départ introuvable' : 'Aucun départ choisi'}</span>
      <span class="t14 mut" style="max-width: 30ch">Choisis d’abord un bus dans la liste des départs, puis reviens ici pour placer ton siège.</span>
      <a class="b p" href="/" onclick={(ev) => { ev.preventDefault(); aller('/'); }}>Voir les départs</a></div>
  {:else if ferme}
    <div class="center"><span class="ill er" aria-hidden="true"><Icone nom="alerte" taille={56} /></span>
      <span class="ttl t20">{depart.statut === 'annule' ? 'Départ annulé' : 'Ce bus est déjà parti'}</span>
      <span class="t14 mut" style="max-width: 30ch">{ligne.de} → {ligne.vers} · {jourSemaineCourt(depart.jour)} {depart.heure}. Choisis un autre départ.</span>
      <a class="b p" href="/" onclick={(ev) => { ev.preventDefault(); aller('/'); }}>Voir les départs</a></div>
  {:else if libres === 0}
    <div class="center"><span class="ill er" aria-hidden="true"><Icone nom="bus" taille={56} /></span>
      <span class="ttl t20">Bus complet</span>
      <span class="t14 mut" style="max-width: 30ch">Les {depart.capacite} places sont prises. Un autre départ de {ligne.de} → {ligne.vers} a sûrement de la place.</span>
      <a class="b p" href="/" onclick={(ev) => { ev.preventDefault(); aller('/'); }}>Voir les autres départs</a></div>
  {:else}
    {#if depart.retardMin > 0}<div class="toast" role="status"><span class="bub" style="color: #FFC24B"><Icone nom="horloge" /></span><span class="t13 grow">Retard annoncé : +{depart.retardMin} min sur ce départ.</span></div>{/if}
    <div class="deckw" style="height: {hauteurDeck}px" role="group" aria-label="Plan du bus en 3D, {rangees} rangées">
      <div class="deck" bind:this={deck} class:vip={ligne.classe === 'VIP'}>
        <div class="cab"><span class="wheel" aria-hidden="true"></span><span>AVANT · chauffeur</span><span>porte</span></div>
        <div class="seats" class:vip={ligne.classe === 'VIP'}>
          {#each plan as s (s.id)}
            {@const sup = supplementSiege(ligne.classe, s.id)}
            <button type="button" class="st" class:tk={indispo.has(s.id)} class:sup={sup > 0} class:on={choisis.includes(s.id)} style="grid-column: {colonneEcran(ligne.classe, s.colonne)}"
              disabled={indispo.has(s.id)} aria-pressed={choisis.includes(s.id)} aria-label="Place {s.id}, {s.fenetre ? 'côté fenêtre' : 'côté couloir'}{sup ? `, supplément ${fmtF(sup)}` : ''}, {etatSiege(s.id)}" onclick={() => basculer(s.id)}>{s.id}</button>
          {/each}
        </div>
      </div>
    </div>
    <div class="lg" aria-hidden="true"><span><i></i>libre</span><span><i class="on"></i>la tienne</span><span><i class="tk"></i>prise</span>{#if ligne.classe === 'Classique'}<span><i class="sup"></i>confort +{SUPPLEMENT_DEVANT.toLocaleString('fr-FR')}</span>{/if}</div>

    <span class="lab">Choix rapide</span>
    <div class="chips" role="group" aria-label="Choix rapide d’une place">
      <button type="button" class="ch" onclick={() => rapide('fenetre')}>Fenêtre</button>
      <button type="button" class="ch" onclick={() => rapide('couloir')}>Couloir</button>
      <button type="button" class="ch" onclick={() => rapide('devant')}>Devant</button>
    </div>

    {#if choisis.length === 0}
      <div class="gl"><span class="t14 mut">Touche une place libre sur le plan pour la réserver. Tu peux en choisir jusqu’à {MAX_PASSAGERS}, une par passager.</span></div>
    {:else}
      <div class="row g8">
        <div class="gl grow col" style="padding: 10px 12px"><span class="lab">Passagère</span><span class="t15 b7">{moi ? `${moi.prenom} ${moi.nom[0]}.` : 'Moi'}</span><span class="t12 mut">place {choisis[0]}</span></div>
        <div class="gl grow col" style="padding: 10px 12px"><span class="lab">Bagage</span><span class="t15 b7">1 valise · inclus</span></div>
      </div>
      {#each choisis as id, i (id)}
        {#if i > 0}
          <div class="gl col g8">
            <div class="row sp"><span class="lab">Passager {i + 1} · place {id}</span><button type="button" class="b g sm" aria-label="Retirer la place {id}" onclick={() => retirer(id)}>Retirer</button></div>
            <div class="fld"><label class="t12 mut" for="nom-{id}">Nom complet</label><input id="nom-{id}" class="inp" autocomplete="off" bind:value={passagers[i].nom} placeholder="Ex. Paul Ndiba" /></div>
            <div class="fld"><label class="t12 mut" for="tel-{id}">Téléphone</label><input id="tel-{id}" class="inp" inputmode="tel" autocomplete="off" bind:value={passagers[i].tel} placeholder="6 77 00 01 11" /></div>
          </div>
        {/if}
      {/each}
      {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
    {/if}
  {/if}

  {#snippet bas()}
    {#if depart && ligne && !ferme && libres > 0}
      <div class="bas" aria-live="polite">
        <div class="row sp">
          <div class="col">
            <span class="lab">{choisis.length > 1 ? `Places ${choisis.join(', ')}` : choisis.length ? `Place ${choisis[0]}` : 'Aucune place'}</span>
            <span class="ttl t18">{choisis.length === 0 ? 'Choisis une place' : choisis.length > 1 ? `${choisis.length} passagers` : `Côté ${siegeCourant?.fenetre ? 'fenêtre' : 'couloir'}${supplementSiege(ligne.classe, choisis[0]) ? ' · confort' : ''}`}</span>
            <span class="t13 mut">{ligne.de} {gare(ligne.gareDe)?.nom} → {ligne.vers} {gare(ligne.gareVers)?.nom} · {duree(ligne.dureeMin)}</span>
          </div>
          <span class="ttl t24 aq" style="white-space: nowrap; flex: none">{fmtF(total)}</span>
        </div>
        <div class="row g8">
          <button type="button" class="b s" onclick={() => continuer(true)}>Pour un proche</button>
          <button type="button" class="b p" disabled={choisis.length === 0} onclick={() => continuer(false)}>Payer {fmtF(total)}</button>
        </div>
      </div>
    {/if}
  {/snippet}
</Mobile>

<style>
  .deckw { position: relative; flex: none; margin: 0 -16px; }
  .deck { position: absolute; top: 12px; left: 50%; width: min(284px, calc(100vw - 84px)); padding: 18px 14px 20px; border-radius: 40px 40px 26px 26px; background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04)); border: 1px solid rgba(255, 255, 255, 0.24); transform: translateX(-50%) perspective(1700px) rotateX(30deg); transform-origin: 50% 0; transform-style: preserve-3d; box-shadow: 0 60px 80px -40px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.2); }
  .deck::before { content: ''; position: absolute; left: 50%; top: -6px; width: 150px; height: 14px; margin-left: -75px; border-radius: 10px 10px 0 0; background: linear-gradient(90deg, #8b7cff, #3de0ff); opacity: 0.8; }
  .cab { display: flex; justify-content: space-between; align-items: center; padding: 0 4px 10px; font: 600 11px 'Geist Mono', monospace; color: #8e99bb; height: 38px; }
  .wheel { width: 28px; height: 28px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, 0.35); }
  .seats { transform-style: preserve-3d; display: grid; grid-template-columns: 1fr 1fr 22px 1fr 1fr; gap: 7px; }
  .seats.vip { grid-template-columns: 1fr 22px 1fr 1fr; }
  .st { height: 46px; min-width: 44px; border-radius: 10px 10px 6px 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1); color: #b7c0db; font: 700 12px 'Geist Mono', monospace; cursor: pointer; transform: translateZ(8px); box-shadow: 0 8px 0 -4px rgba(0, 0, 0, 0.4); display: grid; place-items: center; }
  .st.tk { background: rgba(255, 255, 255, 0.03); color: rgba(255, 255, 255, 0.25); border-style: dashed; cursor: default; box-shadow: none; transform: none; }
  .st.sup { border-color: rgba(255, 194, 75, 0.6); color: #ffc24b; }
  .st.on { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; border-color: transparent; transform: translateZ(18px); box-shadow: 0 14px 24px -8px rgba(61, 224, 255, 0.8); }
  .st:focus-visible, .ch:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .lg { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #b7c0db; justify-content: center; }
  .lg i { display: inline-block; width: 12px; height: 12px; border-radius: 4px; margin-right: 4px; vertical-align: -1px; background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.3); }
  .lg i.on { background: linear-gradient(135deg, #8b7cff, #3de0ff); border-color: transparent; } .lg i.tk { background: transparent; border-style: dashed; } .lg i.sup { border-color: #ffc24b; }
  .chips { align-items: center; flex: none; }
  .bas { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px 18px; border-radius: 28px 28px 0 0; background: rgba(10, 14, 28, 0.94); border-top: 1px solid rgba(255, 255, 255, 0.14); backdrop-filter: blur(20px); }
  .b:disabled { opacity: 0.45; cursor: not-allowed; }
  .bas .b.p { white-space: nowrap; }
  .t15 { font-size: 15px; }
</style>
