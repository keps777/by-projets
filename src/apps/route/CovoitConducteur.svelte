<script lang="ts">
  import { aujourdhui } from '../../data/horloge.ts';
  import { ajouterJours, jourSemaineCourt } from '../../core/dates.ts';
  import { gainConducteur, nomVehicule, PAS_PRIX, PLACES_MAX, PLACES_MIN, placesReservees, pourcentObjectif, PRIX_MAX, PRIX_MIN, placesRestantes } from '../../core/covoit.ts';
  import { VILLES } from '../../core/carte.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { personne, personneCourante } from '../../domain/actions.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { annulerOffre, demarrerTrajet, offresDe, optionsDe, publierOffre, refuserReservation, simulerReservation, terminerTrajet, versementDe } from './actions.ts';
  import { nav } from './nav.ts';

  const moi = $derived(personneCourante());
  const villes = Object.keys(VILLES);
  const jours = $derived(Array.from({ length: 7 }, (_, i) => ajouterJours(aujourdhui(), i)));
  let de = $state('Yaoundé'), vers = $state('Douala'), point = $state('Bastos'), jour = $state(ajouterJours(aujourdhui(), 1)), heure = $state('07:30');
  let places = $state(3), prix = $state(5000), vehicule = $state('Toyota Corolla'), femmes = $state(false), bagages = $state(true), arrets = $state(false);
  let erreur = $state(''), aConfirmer = $state<string | null>(null);
  const gain = $derived(gainConducteur(places, prix)), pct = $derived(pourcentObjectif(gain));
  const mes = $derived(moi ? offresDe(moi.id) : []);
  const STATUT: Record<string, [string, string]> = { ouverte: ['publié', 'ok'], en_route: ['en route', 'ac'], terminee: ['terminé', 'inf'], annulee: ['annulé', 'er'] };

  function publier() {
    if (!moi) return; erreur = '';
    try {
      const o = publierOffre({ de, vers, jour, heure, places, prix, vehicule, pointDepart: point }, moi.id, { femmes, bagages, arrets });
      montrer(`Trajet publié : ${o.de} → ${o.vers} · ${jourSemaineCourt(o.jour)} ${o.heure}`);
    } catch (e) { erreur = e instanceof Error ? e.message : 'Publication impossible.'; }
  }
  function agir(f: () => unknown, ok: string) { try { f(); montrer(ok); } catch (e) { montrer(e instanceof Error && e.message === 'complet' ? 'Le trajet est complet.' : 'Action impossible pour le moment.', 'er'); } aConfirmer = null; }
  const pas = (v: number, d: number, min: number, max: number) => Math.max(min, Math.min(max, v + d));
</script>

<Mobile titre="Je conduis" sous="Publie ton trajet en 30 s" retourVers="/covoit" dock={dockVoyageur('voyager')}>
  {#snippet droite()}<span class="pl ok">vérifié</span>{/snippet}

  <form class="col g12" onsubmit={(e) => { e.preventDefault(); publier(); }}>
    <div class="fld"><span class="lab" id="trajet-lab">Trajet</span>
      <div class="row g8" role="group" aria-labelledby="trajet-lab">
        <select class="inp" aria-label="Ville de départ" bind:value={de}>{#each villes as v (v)}<option>{v}</option>{/each}</select>
        <span aria-hidden="true">→</span>
        <select class="inp" aria-label="Ville d’arrivée" bind:value={vers}>{#each villes as v (v)}<option>{v}</option>{/each}</select>
      </div>
      <input class="inp" aria-label="Point de départ (quartier)" placeholder="Point de départ (ex. Bastos)" bind:value={point} maxlength="40" />
    </div>
    <div class="fld"><span class="lab" id="quand-lab">Quand</span>
      <div class="row g8" role="group" aria-labelledby="quand-lab">
        <select class="inp" aria-label="Jour" bind:value={jour}>{#each jours as j (j)}<option value={j}>{jourSemaineCourt(j)}</option>{/each}</select>
        <input class="inp" type="time" aria-label="Heure de départ" bind:value={heure} style="max-width: 130px" />
      </div>
    </div>
    <div class="duo">
      <div class="gl grow col g4"><span class="lab">Places</span><div class="stp"><button type="button" aria-label="Moins de places" onclick={() => (places = pas(places, -1, PLACES_MIN, PLACES_MAX))}>−</button><b aria-live="polite">{places}</b><button type="button" aria-label="Plus de places" onclick={() => (places = pas(places, 1, PLACES_MIN, PLACES_MAX))}>+</button></div></div>
      <div class="gl grow col g4"><span class="lab">Prix / place</span><div class="stp"><button type="button" aria-label="Baisser le prix" onclick={() => (prix = pas(prix, -PAS_PRIX, PRIX_MIN, PRIX_MAX))}>−</button><b class="px" aria-live="polite">{fmtF(prix)}</b><button type="button" aria-label="Augmenter le prix" onclick={() => (prix = pas(prix, PAS_PRIX, PRIX_MIN, PRIX_MAX))}>+</button></div></div>
    </div>
    <label class="fld"><span class="lab">Véhicule</span><input class="inp" bind:value={vehicule} maxlength="40" placeholder="Toyota Corolla" /></label>
    <div class="gl ac row sp"><span class="col"><span class="lab">Si complet</span><span class="big">{fmtF(gain)}</span><span class="t12 mut">commission 10 % déduite · versé sur MoMo à l’arrivée</span></span><span class="ringp" style="--p: {pct}%"><span class="t13 b7">{pct} %</span></span></div>
    <div class="gl col" style="gap: 0">
      <div class="li"><span class="grow t14 b6" id="o1">Femmes uniquement</span><button type="button" class="sw" class:on={femmes} role="switch" aria-checked={femmes} aria-labelledby="o1" onclick={() => (femmes = !femmes)}></button></div>
      <div class="li"><span class="grow t14 b6" id="o2">Bagages acceptés</span><button type="button" class="sw" class:on={bagages} role="switch" aria-checked={bagages} aria-labelledby="o2" onclick={() => (bagages = !bagages)}></button></div>
      <div class="li"><span class="grow t14 b6" id="o3">Arrêts en route</span><button type="button" class="sw" class:on={arrets} role="switch" aria-checked={arrets} aria-labelledby="o3" onclick={() => (arrets = !arrets)}></button></div>
    </div>
    {#if erreur}<div class="gl" style="border-color: rgba(255,107,107,.5)" role="alert"><span class="t13 erc">{erreur}</span></div>{/if}
    <button type="submit" class="b p">Publier le trajet</button>
    <span class="t12 mut3 c">Tu reçois une notification à chaque réservation · tu peux refuser sans frais.</span>
  </form>

  <span class="lab">Mes trajets publiés</span>
  {#each mes as o (o.id)}
    {@const [txt, ton] = STATUT[o.statut]}
    {@const opts = optionsDe(o.id)}
    <article class="gl col g8" aria-label="Trajet {o.de} vers {o.vers}">
      <div class="row sp"><span class="col"><span class="t15 b7">{o.de} → {o.vers}</span><span class="t12 mut">{jourSemaineCourt(o.jour)} {o.heure} · départ {o.depart} · {nomVehicule(o.vehicule)}</span></span><span class="pl {ton}">{txt}</span></div>
      <div class="row sp t13"><span>{placesReservees(o)} / {o.places} place{o.places > 1 ? 's' : ''} réservée{placesReservees(o) > 1 ? 's' : ''}</span><span class="b7 aq">{fmtF(gainConducteur(placesReservees(o), o.prix))}</span></div>
      <div class="row g6 wrapf">{#if opts.femmes}<span class="pl">femmes</span>{/if}{#if opts.bagages}<span class="pl">bagages</span>{/if}{#if opts.arrets}<span class="pl">arrêts</span>{/if}</div>
      {#each o.reservations as r (r.paiementId)}
        <div class="row g8 resa"><span class="av sm">{personne(r.voyageurId)?.prenom[0] ?? '?'}</span><span class="col grow"><span class="t13 b7">{personne(r.voyageurId)?.prenom} {personne(r.voyageurId)?.nom}</span><span class="t12 mut">{r.places} place{r.places > 1 ? 's' : ''} · {fmtF(r.places * o.prix)}</span></span>
          {#if o.statut === 'ouverte'}<button type="button" class="b s sm" onclick={() => agir(() => refuserReservation(o.id, moi!.id, r.voyageurId), 'Réservation refusée, voyageur remboursé')}>Refuser</button>{/if}</div>
      {:else}
        <span class="t13 mut3">Pas encore de réservation.</span>
      {/each}
      {#if o.statut === 'terminee'}
        <span class="t13 okc">Trajet terminé · {fmtF(versementDe(o.id)?.montant ?? 0)} versés sur MoMo</span>
      {:else if o.statut === 'ouverte'}
        <div class="row g8 wrapf">
          <button type="button" class="b p sm grow" onclick={() => agir(() => demarrerTrajet(o.id, moi!.id), 'Trajet démarré, bonne route !')}>Démarrer le trajet</button>
          <button type="button" class="b s sm" disabled={placesRestantes(o) === 0} onclick={() => agir(() => simulerReservation(o.id, ['p-maman', 'p-paul'].find((v) => !o.reservations.some((r) => r.voyageurId === v)) ?? 'p-maman'), 'Réservation reçue (démo)')}>Simuler une réservation</button>
        </div>
        {#if aConfirmer === o.id}
          <div class="row g8"><button type="button" class="b d sm grow" onclick={() => agir(() => annulerOffre(o.id, moi!.id), 'Trajet annulé, voyageurs remboursés')}>Confirmer l’annulation</button><button type="button" class="b s sm" onclick={() => (aConfirmer = null)}>Garder</button></div>
        {:else}<button type="button" class="b g sm" onclick={() => (aConfirmer = o.id)}>Annuler le trajet</button>{/if}
      {:else if o.statut === 'en_route'}
        <button type="button" class="b p" onclick={() => agir(() => terminerTrajet(o.id, moi!.id), 'Trajet terminé, gain versé')}>Terminer le trajet</button>
      {/if}
    </article>
  {:else}
    <div class="gl row g12"><span class="bub aq"><Icone nom="taxi" taille={20} /></span><span class="t13 grow">Tu n’as encore rien publié. Les réservations de tes passagers apparaîtront ici.</span></div>
  {/each}
  <a class="b g" href="/covoit" use:nav>Voir les trajets des autres conducteurs</a>
</Mobile>

<style>
  select.inp, input.inp { appearance: none; min-height: 50px; }
  select.inp { flex: 1; }
  .duo { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .stp { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .stp .px { font-size: 13px; min-width: 0; white-space: nowrap; }
  .stp button { flex: none; width: 44px; height: 44px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; font: 700 20px 'Sora Variable', 'Sora', sans-serif; cursor: pointer; }
  .stp b { min-width: 52px; text-align: center; font: 700 20px 'Unbounded Variable', 'Unbounded', sans-serif; }
  .resa { padding: 6px 0; border-top: 1px solid rgba(255, 255, 255, 0.08); }
  .t15 { font-size: 15px; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
