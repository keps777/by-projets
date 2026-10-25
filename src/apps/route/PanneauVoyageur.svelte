<script lang="ts">
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { personneCourante } from '../../domain/actions.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { aNote, mesReservations, resaActive, type PhaseResa } from './covoitActions.ts';
  import BilletCovoit from './BilletCovoit.svelte';
  import FeuillesVoyageur from './FeuillesVoyageur.svelte';
  import IconeCv from './IconeCv.svelte';
  import MenuDeroulant, { type Choix } from './MenuDeroulant.svelte';
  import Recherche from './Recherche.svelte';
  import { horloge } from './temps.svelte.ts';

  /** Mode Voyageur : mon covoiturage (menu, billet, actions), la liste de mes covoiturages, puis la recherche d'offres. */
  let { onconduire, modeInitial = 'villes' }: { onconduire: () => void; modeInitial?: 'villes' | 'ville' } = $props();
  const h = horloge(15_000), moi = $derived(personneCourante());
  const resas = $derived(mesReservations(moi?.id, h.ms));
  let choix = $state(''), quoi = $state<string | null>(null);
  const resa = $derived(resas.find((r) => r.offre.id === choix) ?? resas[0]);
  const LIB: Record<PhaseResa, [string, Choix['ton']]> = { a_venir: ['à venir', 'ok'], en_route: ['en route', 'ac'], terminee: ['terminé', ''], passee: ['passé', ''] };
  const items = $derived<Choix[]>(resas.map((r) => ({ id: r.offre.id, titre: `${r.offre.de} → ${r.offre.vers}`, sous: `${jourSemaineCourt(r.offre.jour)} · ${r.offre.heure} · ${r.places} place${r.places > 1 ? 's' : ''}`, badge: LIB[r.phase][0], ton: LIB[r.phase][1] })));
  const aVenir = $derived(!!resa && resaActive(resa)), peutNoter = $derived(!!resa && resa.phase === 'terminee' && !aNote(resa.offre.id, resa.voyageurId, resa.offre.conducteurId));
  const nbVenir = $derived(resas.filter(resaActive).length);
  function versRecherche() { document.getElementById('cv-recherche')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
</script>

<div class="cv-sec" data-noswipe="false">
  {#if resa}
    <MenuDeroulant choix={items} bind:valeur={choix} label="Mon covoiturage" />
    <BilletCovoit {resa} />
    {#if peutNoter}
      <button type="button" class="cv-verre vi row g12 note" onclick={() => (quoi = 'avis')}><span class="bub aq"><IconeCv nom="etoile" taille={20} /></span><span class="col grow"><span class="t14 b7">Comment s’est passé ton trajet ?</span><span class="t12 mut">Note ton conducteur en 10 secondes</span></span><span class="cv-badge ac">noter</span></button>
    {/if}
    <div class="cv-grille deux">
      <button type="button" class="cv-bouton p" onclick={() => (quoi = 'suivi')}><IconeCv nom="position" taille={18} />Suivre mon voyage</button>
      <button type="button" class="cv-bouton" aria-label="Moto-taxi vers le point de rencontre" disabled={!aVenir || resa.phase !== 'a_venir'} onclick={() => (quoi = 'moto')}><IconeCv nom="moto" taille={18} />Moto-taxi</button>
    </div>
    <div class="cv-grille trois">
      <button type="button" class="cv-bouton" onclick={() => (quoi = 'partage')}><IconeCv nom="partage" taille={17} />Partager</button>
      <button type="button" class="cv-bouton" disabled={resa.phase !== 'a_venir'} onclick={() => (quoi = 'annuler')}>Annuler</button>
      <button type="button" class="cv-bouton" onclick={() => (quoi = 'probleme')}><IconeCv nom="sos" taille={17} />Problème</button>
    </div>
    <span class="cv-note c">Tu as payé {fmtF(resa.montant)} · {aVenir ? 'donne ton code au conducteur en montant' : 'merci d’avoir voyagé ensemble'}</span>

    <span class="cv-titre">Mes covoiturages · {resas.length}{nbVenir ? ` (${nbVenir} à venir)` : ''}</span>
    <div class="col g8">
      {#each resas as r (r.offre.id + r.paiement.id)}
        <button type="button" class="cv-ligne" aria-current={r.offre.id === resa.offre.id ? 'true' : undefined} onclick={() => { choix = r.offre.id; document.querySelector('.bd')?.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <span class="col grow"><span class="t14 b7 ell">{r.offre.de} → {r.offre.vers}</span><span class="t12 mut ell">{jourSemaineCourt(r.offre.jour)} · {r.offre.heure} · {fmtF(r.montant)}</span></span>
          <span class="cv-badge {LIB[r.phase][1]}">{LIB[r.phase][0]}</span>
        </button>
      {/each}
    </div>
    <FeuillesVoyageur {resa} bind:quoi maintenant={h.ms} />
  {:else}
    <div class="cv-verre vi vide">
      <div class="ill" aria-hidden="true"><IconeCv nom="voiture" taille={52} trait={1.5} /></div>
      <span class="ttl t18">Ton billet de covoiturage</span>
      <span class="t13 mut">Réserve une place ci-dessous : ton billet, son code de prise en charge et le suivi du voyage apparaissent ici.</span>
      <button type="button" class="cv-bouton p" onclick={versRecherche}>Trouver un covoiturage</button>
    </div>
  {/if}
  <Recherche {modeInitial} {onconduire} />
</div>

<style>
  .deux { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); } .trois { grid-template-columns: repeat(3, minmax(0, 1fr)); } .trois :global(.cv-bouton), .deux :global(.cv-bouton) { padding: 0 8px; }
  .note { width: 100%; text-align: left; color: inherit; font: inherit; cursor: pointer; }
  .vide { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 22px 16px; }
  .vide .ill { width: 96px; height: 96px; border-radius: 30px; }
</style>
