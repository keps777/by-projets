<script lang="ts">
  import { param, aller } from '../../router.svelte.ts';
  import { compagnieDe, departParId, ligneDe, personneCourante, placesLibres, departEnMs } from '../../domain/actions.ts';
  import { app } from '../../data/store.svelte.ts';
  import { prixArret, prochainArret } from '../../core/arrets.ts';
  import { delai, minutesDepuisMinuit } from '../../core/suivi.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { arretDisponible, arretsDuDepart, billetASuivre, monterEnRoute } from './actions.ts';
  import { horloge } from './temps.svelte.ts';
  import { nav } from './nav.ts';

  const h = horloge(15_000);
  const moi = $derived(personneCourante());
  /** Départ demandé (?depart=), sinon celui du billet de la voyageuse, sinon le premier bus en route. */
  const d = $derived((() => {
    const id = param('depart'); const demande = id ? departParId(id) : undefined; if (demande) return demande;
    const b = moi ? billetASuivre(moi.id, h.ms) : undefined; if (b) return departParId(b.departId);
    return app.monde.departs.find((x) => x.statut === 'parti');
  })());
  const introuvable = $derived(!!param('depart') && !departParId(param('depart')!));
  const ligne = $derived(d ? ligneDe(d) : undefined);
  const arrets = $derived(d ? arretsDuDepart(d) : []);
  const nowMin = $derived(d ? minutesDepuisMinuit(h.ms, d.jour) : 0);
  const libres = $derived(d ? placesLibres(d) : 0);
  const ferme = $derived(!d || d.statut === 'annule' || d.statut === 'arrive');
  const dispo = $derived(d ? arrets.map((a) => arretDisponible(d, a, h.ms)) : []);
  const prochain = $derived(prochainArret(arrets, nowMin));
  let choisi = $state<string | null>(null), occupe = $state(false), erreur = $state('');
  // Arrêt choisi : celui de l'utilisateur s'il est encore atteignable, sinon le premier arrêt disponible après le bus (mockup : Boumnyebel).
  const idSel = $derived(choisi && arrets.some((a, i) => a.id === choisi && dispo[i]) ? choisi : (arrets.find((a, i) => dispo[i] && a.type === 'etape')?.id ?? arrets.find((_, i) => dispo[i])?.id ?? null));
  const sel = $derived(arrets.find((a) => a.id === idSel));
  const prixSel = $derived(d && sel ? prixArret(d.prix, sel) : 0);
  const position = $derived(d?.statut === 'parti' && prochain ? `vers ${prochain.arret.nom.split(' · ')[0]}` : '');
  const dernierPasse = $derived([...arrets].reverse().find((a) => a.min <= nowMin));
  const retardTxt = $derived(d && d.retardMin > 0 ? `retard +${d.retardMin} min` : 'à l’heure');

  function reserver() {
    if (!d || !sel || !moi) return;
    occupe = true; erreur = '';
    try {
      const r = monterEnRoute(d.id, sel.id, moi.id);
      montrer(`Place retenue à ${r.arret.nom} · ${fmtF(r.prix)} à régler`);
      aller(`/paiement?paiement=${r.paiement.id}`);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      erreur = m === 'complet' ? 'Ce bus est complet.' : m === 'arret_passe' ? 'Le bus a déjà passé cet arrêt : choisis le suivant.' : m === 'depart_ferme' ? 'Ce départ n’est plus ouvert à la réservation.' : 'Réservation impossible pour le moment.';
      choisi = null;
    } finally { occupe = false; }
  }
</script>

<Mobile titre="Monter en route" sous={d && ligne ? `${compagnieDe(d).nom} ${d.heure} · ${ligne.de} → ${ligne.vers}` : 'Arrêts sur la ligne'} retourVers="/direct" dock={dockVoyageur('voyager')}>
  {#snippet droite()}{#if d && !ferme}<span class="pl" class:ok={libres > 3} class:wa={libres <= 3}>{libres} place{libres > 1 ? 's' : ''}</span>{/if}{/snippet}

  {#snippet bas()}
    {#if d && ligne && sel && !ferme && libres > 0}
      <div class="sheet bas">
        <div class="row sp">
          <div class="col"><span class="lab">Depuis {sel.nom.split(' · ')[0]}</span><span class="ttl t20">{sel.heure} → {ligne.vers}</span><span class="t12 mut">sans siège attribué · tu montes avec ton code{d.chauffeurId ? ' · le chauffeur est prévenu' : ''}</span></div>
          <span class="ttl t24 aq" style="white-space: nowrap">{fmtF(prixSel)}</span>
        </div>
        <button type="button" class="b p" onclick={reserver} disabled={occupe}>Monter ici · {fmtF(prixSel)}</button>
      </div>
    {/if}
  {/snippet}

  {#if !d || !ligne || introuvable}
    <div class="center">
      <div class="ill" aria-hidden="true"><Icone nom="bus" taille={64} trait={1.6} /></div>
      <span class="ttl t20">{introuvable ? 'Départ introuvable' : 'Aucun bus en route'}</span>
      <span class="t14 mut">{introuvable ? 'Ce départ n’existe plus.' : 'Choisis un bus sur le réseau pour monter à un arrêt de la ligne.'}</span>
    </div>
    <a class="b p" href="/reseau" use:nav>Voir le réseau en direct</a>
  {:else}
    <div class="gl ac row sp">
      <span class="col">
        <span class="lab">{d.statut === 'parti' ? 'Le bus est à' : d.statut === 'arrive' ? 'Le bus est' : 'Le bus part à'}</span>
        <span class="t16 b7">{d.statut === 'parti' ? (dernierPasse ? `${dernierPasse.nom.split(' · ')[0]} · ${dernierPasse.heure}` : position) : d.statut === 'arrive' ? 'arrivé' : `${arrets[0].nom} · ${arrets[0].heure}`}</span>
        <span class="t12 mut">{d.statut === 'parti' ? `suivi en direct · ${retardTxt}` : d.statut === 'annule' ? 'départ annulé' : `${retardTxt} · départ dans ${delai(Math.round((departEnMs(d) - h.ms) / 60_000))}`}</span>
      </span>
      <a class="b s sm" href="/direct" use:nav>Carte</a>
    </div>

    {#if ferme}
      <div class="gl row g12" role="alert"><span class="bub wac"><Icone nom="alerte" taille={20} /></span><span class="t14 grow">{d.statut === 'annule' ? 'Ce départ est annulé.' : 'Ce bus est arrivé : on ne peut plus y monter.'}</span></div>
    {:else if libres === 0}
      <div class="gl row g12" role="alert"><span class="bub wac"><Icone nom="alerte" taille={20} /></span><span class="t14 grow">Ce bus est complet : aucune montée en route possible.</span></div>
    {/if}

    <span class="lab" id="arret-lab">Choisis ton arrêt de montée</span>
    <div class="gl">
      <div class="tl" role="radiogroup" aria-labelledby="arret-lab">
        {#each arrets as a, i (a.id)}
          {@const ok = dispo[i] && libres > 0}
          <button type="button" role="radio" aria-checked={idSel === a.id} class="stp" class:pass={!dispo[i] && a.min <= nowMin} class:on={idSel === a.id} disabled={!ok} onclick={() => { choisi = a.id; erreur = ''; }}>
            <span class="col grow"><span class="t15 b7 ell">{a.nom}</span><span class="t12 mut">{a.type === 'arrivee' ? a.sous : a.min <= nowMin && d.statut === 'parti' ? `passé · ${a.sous}` : a.sous}</span></span>
            <span class="col" style="align-items: flex-end"><span class="mono t13">{a.heure}</span><span class="t13 b7 aq">{a.type === 'arrivee' ? 'terminus' : fmtF(prixArret(d.prix, a))}</span></span>
          </button>
        {/each}
      </div>
    </div>

    {#if erreur}<div class="gl row g12" role="alert" style="border-color: rgba(255,107,107,.5)"><span class="t13 erc grow">{erreur}</span></div>{/if}

  {/if}
</Mobile>

<style>
  .tl { position: relative; padding-left: 30px; display: flex; flex-direction: column; }
  .tl::before { content: ''; position: absolute; left: 11px; top: 14px; bottom: 14px; width: 2px; background: linear-gradient(180deg, #8b7cff, #3de0ff); }
  .stp { position: relative; display: flex; align-items: center; gap: 10px; min-height: 56px; width: 100%; border: 0; background: transparent; color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; padding: 4px 8px; border-radius: 14px; }
  .stp::before { content: ''; position: absolute; left: -25px; top: 50%; width: 14px; height: 14px; margin-top: -7px; border-radius: 50%; background: #05070d; border: 3px solid rgba(255, 255, 255, 0.3); }
  .stp.on { background: rgba(61, 224, 255, 0.12); } .stp.on::before { border-color: #3de0ff; background: #3de0ff; box-shadow: 0 0 14px #3de0ff; }
  .stp.pass { opacity: 0.5; } .stp.pass::before { border-color: #4ade80; background: #4ade80; }
  .stp:disabled { cursor: not-allowed; } .stp:disabled:not(.pass) { opacity: 0.55; }
  .bas { margin: 0 0 96px; border-radius: 28px 28px 0 0; padding-bottom: 12px; }
  .t15 { font-size: 15px; }
  button:disabled.b { opacity: 0.6; }
</style>
