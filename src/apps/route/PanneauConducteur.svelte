<script lang="ts">
  import { gainConducteur, placesReservees, placesRestantes, pourcentObjectif } from '../../core/covoit.ts';
  import { nomVehiculeProfil, statutVerification } from '../../core/covoitProfil.ts';
  import { repartition } from '../../core/covoitPrix.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { personneCourante } from '../../domain/actions.ts';
  import type { OffreCovoit } from '../../domain/types.ts';
  import Feuille from '../../ui/Feuille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { gainsDuMois, mesTrajets, occupantsDe, profilDe, profilEstComplet } from './covoitActions.ts';
  import FeuillesConducteur from './FeuillesConducteur.svelte';
  import IconeCv from './IconeCv.svelte';
  import MenuDeroulant, { type Choix } from './MenuDeroulant.svelte';
  import ProfilConducteurForm from './ProfilConducteurForm.svelte';
  import PublierTrajet from './PublierTrajet.svelte';
  import { nav } from './nav.ts';
  import { horloge } from './temps.svelte.ts';
  import Vehicule3D from './Vehicule3D.svelte';

  /** Mode Conducteur : profil obligatoire la première fois, puis mes trajets (menu), mon véhicule en 3D avec les places occupées, les actions et la liste de mes trajets. */
  let { moiId, ouvrirProfil = false }: { moiId: string; ouvrirProfil?: boolean } = $props();
  const h = horloge(15_000), moi = $derived(personneCourante());
  const profil = $derived(profilDe(moiId)), complet = $derived(profilEstComplet(moiId)), statut = $derived(profil ? statutVerification(profil, h.ms) : undefined);
  const trajets = $derived(mesTrajets(moiId)), gains = $derived(gainsDuMois(moiId, h.ms));
  let choix = $state(''), quoi = $state<string | null>(null), fenetreProfil = $state(ouvrirProfil && !profilEstComplet(moiId)), publier = $state(false);
  const tous = $derived([...trajets.aVenir, ...trajets.passes]);
  const offre = $derived<OffreCovoit | undefined>(tous.find((o) => o.id === choix) ?? trajets.aVenir[0] ?? trajets.passes[0]);
  const LIB: Record<string, [string, Choix['ton']]> = { ouverte: ['publié', 'ok'], en_route: ['en route', 'ac'], terminee: ['terminé', ''], annulee: ['annulé', 'er'] };
  const items = $derived<Choix[]>(trajets.aVenir.map((o) => ({ id: o.id, titre: `${o.de} → ${o.vers}`, sous: `${jourSemaineCourt(o.jour)} · ${o.heure} · ${placesReservees(o)}/${o.places} places`, badge: LIB[o.statut][0], ton: LIB[o.statut][1] })));
  const vide = $derived(!trajets.aVenir.length);
  const actif = $derived(!!offre && (offre.statut === 'ouverte' || offre.statut === 'en_route'));
  const occupants = $derived(offre && actif ? occupantsDe(offre) : []);
  const rep = $derived(offre ? repartition(offre.prix, Math.max(placesReservees(offre), 0)) : undefined);
  const fin = $derived(profil ? (statutVerification(profil, h.ms) === 'verifie' ? 'vérifié' : 'en vérification') : '');
  function apresProfil() { fenetreProfil = false; }
</script>

<div class="cv-sec">
  {#if !complet}
    <div class="cv-verre vi col g8">
      <div class="row g12"><span class="bub aq"><IconeCv nom="bouclier" taille={22} /></span><span class="col grow"><span class="t16 b7">Avant de conduire</span><span class="t13 mut">Complète ton profil conducteur : identité, permis, véhicule et photos. C’est rapide et obligatoire pour la sécurité de tous.</span></span></div>
      <button type="button" class="cv-bouton p" onclick={() => (fenetreProfil = true)}>Compléter mon profil conducteur</button>
    </div>
    <Vehicule3D carrosserie="berline" couleur="Gris" places={3} occupants={[]} nom="Ton véhicule apparaîtra ici" />
  {:else if profil}
    <div class="cv-verre row g12 sp bandeau"><span class="row g8"><span class="cv-badge {fin === 'vérifié' ? 'ok' : 'wa'}"><IconeCv nom="bouclier" taille={12} />profil {fin}</span><span class="t12 mut ell">{nomVehiculeProfil(profil)}</span></span><a class="t13 b7" href="/moi/conducteur" use:nav>Modifier</a></div>

    <MenuDeroulant choix={items} bind:valeur={choix} label="Mon trajet" vide="Aucun trajet publié" />
    <Vehicule3D carrosserie={profil.vehicule.carrosserie} couleur={profil.vehicule.couleur} places={offre && actif ? offre.places : profil.vehicule.places} {occupants} nom={nomVehiculeProfil(profil)} plaque={profil.vehicule.plaque} note={offre && actif ? `${placesRestantes(offre)} libre${placesRestantes(offre) > 1 ? 's' : ''}` : 'aucun trajet en cours'} />

    {#if offre && actif && rep}
      <div class="cv-verre vi col g8" aria-label="Mon trajet">
        <div class="row sp"><span class="col"><span class="t16 b7">{offre.de} → {offre.vers}</span><span class="t12 mut">{jourSemaineCourt(offre.jour)} {offre.heure} · départ {offre.depart}</span></span><span class="cv-badge {LIB[offre.statut][1]}">{LIB[offre.statut][0]}</span></div>
        <div class="cv-grille" style="grid-template-columns: 1fr 1fr 1fr"><span class="col"><span class="lab">Prix</span><span class="t14 b7">{fmtF(offre.prix)}</span></span><span class="col"><span class="lab">Net / place</span><span class="t14 b7 okc">{fmtF(gainConducteur(1, offre.prix))}</span></span><span class="col"><span class="lab">Gain attendu</span><span class="t14 b7 okc">{fmtF(rep.net)}</span></span></div>
        <span class="t12 mut3">Net après la commission d’AfriMove (10 %) · {placesReservees(offre)} / {offre.places} place{offre.places > 1 ? 's' : ''} réservée{placesReservees(offre) > 1 ? 's' : ''}</span>
      </div>
    {:else if vide}
      <div class="cv-verre vi col g8" style="align-items: center; text-align: center"><span class="ttl t18">{trajets.passes.length ? 'Aucun trajet à venir' : 'Publie ton premier trajet'}</span><span class="t13 mut">Remplis ta voiture et partage les frais : AfriMove ne prend que 10 %.</span><button type="button" class="cv-bouton p" onclick={() => (publier = true)}>{trajets.passes.length ? 'Publier un trajet' : 'Publier mon premier trajet'}</button></div>
    {/if}

    <div class="cv-grille deux">
      <button type="button" class="cv-bouton p" disabled={!offre} onclick={() => (quoi = 'suivi')}><IconeCv nom="position" taille={18} />Suivre mon voyage</button>
      <button type="button" class="cv-bouton" onclick={() => (publier = true)}><IconeCv nom="plus" taille={18} />Ajouter un trajet</button>
    </div>
    <div class="cv-grille trois">
      <button type="button" class="cv-bouton" disabled={!offre} onclick={() => (quoi = 'partage')}><IconeCv nom="partage" taille={17} />Partager</button>
      <button type="button" class="cv-bouton" disabled={!offre || offre.statut !== 'ouverte'} onclick={() => (quoi = 'annuler')}>Annuler</button>
      <button type="button" class="cv-bouton" disabled={!offre} onclick={() => (quoi = 'probleme')}><IconeCv nom="sos" taille={17} />Problème</button>
    </div>

    <div class="cv-verre row g12" aria-label="Gains du mois">
      <span class="col grow"><span class="lab">Gains du mois</span><span class="big">{fmtF(gains.mois)}</span><span class="t12 mut">{gains.trajets} trajet{gains.trajets > 1 ? 's' : ''} · {gains.passagers} passager{gains.passagers > 1 ? 's' : ''} · {fmtF(gains.aVenir)} à venir</span></span>
      <span class="ringp" style="--p: {pourcentObjectif(gains.mois + gains.aVenir)}%; width: 84px; height: 84px"><span class="t13 b7">{pourcentObjectif(gains.mois + gains.aVenir)} %</span></span>
    </div>

    <span class="cv-titre">Mes trajets · {tous.length}</span>
    <div class="col g8">
      {#each tous as o (o.id)}
        <button type="button" class="cv-ligne" aria-current={o.id === offre?.id ? 'true' : undefined} onclick={() => { choix = o.id; document.querySelector('.bd')?.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <span class="col grow"><span class="t14 b7 ell">{o.de} → {o.vers}</span><span class="t12 mut ell">{jourSemaineCourt(o.jour)} · {o.heure} · {placesReservees(o)}/{o.places} places · {fmtF(o.prix)}</span></span>
          <span class="cv-badge {LIB[o.statut][1]}">{LIB[o.statut][0]}</span>
        </button>
      {:else}<span class="cv-note">Tes trajets publiés apparaîtront ici avec leurs réservations.</span>{/each}
    </div>
    <FeuillesConducteur {offre} conducteurId={moiId} bind:quoi maintenant={h.ms} />
    <PublierTrajet bind:ouvert={publier} conducteurId={moiId} onpublie={(o) => { choix = o[0].id; }} />
  {/if}
</div>

<Feuille bind:ouvert={fenetreProfil} titre="Mon profil conducteur" sous="Obligatoire pour publier un trajet" hauteur="haute">
  {#if moi}<ProfilConducteurForm personneId={moi.id} onenregistre={apresProfil} />{/if}
</Feuille>

<style>
  .deux { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); } .trois { grid-template-columns: repeat(3, minmax(0, 1fr)); } .trois :global(.cv-bouton), .deux :global(.cv-bouton) { padding: 0 8px; }
  .bandeau { padding: 8px 14px; min-height: 52px; }
</style>
