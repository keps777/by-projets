<script lang="ts">
  import { gainConducteur, nomVehicule, placesReservees, placesRestantes } from '../../core/covoit.ts';
  import { lienTel, lienWhatsApp } from '../../core/covoitRegles.ts';
  import { suiviTrajet } from '../../core/covoitSuivi.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { personne } from '../../domain/actions.ts';
  import type { OffreCovoit } from '../../domain/types.ts';
  import Feuille from '../../ui/Feuille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { annulerOffre, demarrerTrajet, refuserReservation, simulerReservation, terminerTrajet, versementDe } from './actions.ts';
  import { aNote, confirmerMontee, dureeOffre, estMonte, optionsOffre } from './covoitActions.ts';
  import FeuilleAvis from './FeuilleAvis.svelte';
  import FeuilleProbleme from './FeuilleProbleme.svelte';
  import IconeCv from './IconeCv.svelte';

  /** Les fenêtres du mode Conducteur pour le trajet choisi : suivre (démarrer, passagers et codes, terminer), partager, annuler, problème, avis sur les passagers. */
  let { offre, conducteurId, quoi = $bindable(null), maintenant }: { offre: OffreCovoit | undefined; conducteurId: string; quoi: string | null; maintenant: number } = $props();
  const ferme = (nom: string) => ({ get: () => quoi === nom, set: (v: boolean) => { if (!v && quoi === nom) quoi = null; } });
  const suivi = $derived(offre ? suiviTrajet(offre, maintenant, dureeOffre(offre)) : undefined), opts = $derived(offre ? optionsOffre(offre.id, conducteurId) : undefined);
  let codes = $state<Record<string, string>>({}), erreurCode = $state<string | null>(null), pourAvis = $state<string | null>(null);
  const passagers = $derived(offre ? offre.reservations.map((r) => ({ r, p: personne(r.voyageurId) })) : []);
  const msg = $derived(offre ? `Je conduis ${offre.depart} → ${offre.vers} le ${jourSemaineCourt(offre.jour)} à ${offre.heure}, ${fmtF(offre.prix)} la place, ${placesRestantes(offre)} place(s) libre(s). Réserve sur AfriMove !` : '');
  const agir = (f: () => unknown, ok: string) => { try { f(); montrer(ok); } catch { montrer('Action impossible pour le moment.', 'er'); } };
  function verifier(voyageurId: string) { if (!offre) return; const bon = confirmerMontee(offre.id, conducteurId, voyageurId, codes[voyageurId] ?? ''); erreurCode = bon ? null : voyageurId; if (bon) montrer('Code validé : passager monté'); }
  const versement = $derived(offre ? versementDe(offre.id) : undefined);
</script>

{#if offre}
  <Feuille bind:ouvert={ferme('suivi').get, ferme('suivi').set} titre="Suivre mon voyage" sous="{offre.de} → {offre.vers} · {offre.heure}" hauteur="haute">
    {#if suivi}
      <div class="cv-verre vi col g8" role="status" aria-live="polite">
        <span class="row sp"><span class="ttl t18">{suivi.titre}</span><span class="cv-badge ac">{placesReservees(offre)} / {offre.places} place{offre.places > 1 ? 's' : ''} réservée{placesReservees(offre) > 1 ? 's' : ''}</span></span>
        <span class="t13 mut">{suivi.detail}</span>
        <div class="piste" aria-hidden="true"><i style="width: {suivi.progres * 100}%"></i><span style="left: {suivi.progres * 100}%"><IconeCv nom="voiture" taille={18} /></span></div>
      </div>
    {/if}
    <span class="cv-titre">Passagers</span>
    {#each passagers as { r, p } (r.paiementId)}
      <div class="cv-verre col g8 passager">
        <div class="row g12"><span class="av">{p?.prenom[0]}{p?.nom[0]}</span><span class="col grow"><span class="t14 b7">{p?.prenom} {p?.nom}</span><span class="t12 mut">{r.places} place{r.places > 1 ? 's' : ''} · {fmtF(r.places * offre.prix)}</span></span>
          {#if p}<a class="ib" href={lienTel(p.tel)} aria-label="Appeler {p.prenom}"><IconeCv nom="tel" taille={18} /></a>{/if}</div>
        {#if estMonte(offre.id, r.voyageurId)}<span class="cv-badge ok">monté · code validé</span>
        {:else if offre.statut === 'ouverte'}
          <div class="row g8"><input class="inp" inputmode="numeric" maxlength="4" placeholder="4 chiffres" aria-label="Code de prise en charge de {p?.prenom}" bind:value={codes[r.voyageurId]} style="min-height: 46px" />
            <button type="button" class="cv-bouton" onclick={() => verifier(r.voyageurId)}>Vérifier</button>
            <button type="button" class="cv-bouton" aria-label="Refuser {p?.prenom}" onclick={() => agir(() => refuserReservation(offre.id, conducteurId, r.voyageurId), 'Réservation refusée, voyageur remboursé')}>Refuser</button></div>
          {#if erreurCode === r.voyageurId}<span class="t12 erc" role="alert">Ce code ne correspond pas.</span>{/if}
        {/if}
        {#if offre.statut === 'terminee'}
          {#if aNote(offre.id, conducteurId, r.voyageurId)}<span class="cv-badge ok">avis donné</span>{:else}<button type="button" class="cv-bouton" onclick={() => (pourAvis = r.voyageurId)}><IconeCv nom="etoile" taille={16} />Noter {p?.prenom}</button>{/if}
        {/if}
      </div>
    {:else}<span class="cv-note">Pas encore de réservation. Partage ton trajet pour remplir la voiture.</span>{/each}
    {#if offre.statut === 'terminee'}<div class="cv-verre" role="status"><span class="t14 b7 okc">Trajet terminé · {fmtF(versement?.montant ?? 0)} versés sur MoMo</span></div>{/if}
    {#snippet pied()}
      {#if offre.statut === 'ouverte'}
        <button type="button" class="cv-bouton p" onclick={() => agir(() => demarrerTrajet(offre.id, conducteurId), 'Trajet démarré, bonne route !')}>Démarrer le trajet</button>
        <button type="button" class="cv-bouton" disabled={placesRestantes(offre) === 0} onclick={() => agir(() => simulerReservation(offre.id, ['p-maman', 'p-paul'].find((v) => !offre.reservations.some((r) => r.voyageurId === v)) ?? 'p-maman'), 'Réservation reçue (démo)')}>Simuler une réservation (démo)</button>
      {:else if offre.statut === 'en_route'}
        <button type="button" class="cv-bouton p" onclick={() => agir(() => terminerTrajet(offre.id, conducteurId), 'Trajet terminé, gain versé')}>Terminer le trajet</button>
      {/if}
    {/snippet}
  </Feuille>

  <Feuille bind:ouvert={ferme('partage').get, ferme('partage').set} titre="Partager mon trajet" sous="Remplis ta voiture plus vite">
    <div class="cv-verre"><p class="t13">{msg}</p></div>
    <div class="cv-verre row sp t13"><span>{fmtF(offre.prix)} la place</span><span class="okc b7">tu reçois {fmtF(gainConducteur(1, offre.prix))}</span></div>
    <a class="cv-bouton p" href={lienWhatsApp(msg)} target="_blank" rel="noopener"><IconeCv nom="whatsapp" taille={18} />Partager sur WhatsApp</a>
    <div class="row g6 wrapf">{#if opts?.femmes}<span class="cv-badge ac">entre femmes</span>{/if}{#if opts?.bagages}<span class="cv-badge">bagages</span>{/if}{#if opts?.arrets}<span class="cv-badge">arrêts</span>{/if}<span class="cv-badge">{nomVehicule(offre.vehicule)}</span></div>
  </Feuille>

  <Feuille bind:ouvert={ferme('annuler').get, ferme('annuler').set} titre="Annuler ce trajet" sous="{offre.de} → {offre.vers} · {jourSemaineCourt(offre.jour)} {offre.heure}">
    <div class="cv-verre vi col g4" role="status"><span class="t14 b7">{offre.reservations.length ? `${placesReservees(offre)} place${placesReservees(offre) > 1 ? 's' : ''} réservée${placesReservees(offre) > 1 ? 's' : ''}` : 'Aucune réservation'}</span>
      <span class="t13 mut">{offre.reservations.length ? 'Tes passagers sont prévenus et remboursés intégralement. Annuler souvent fait baisser ta visibilité.' : 'Le trajet est retiré de la recherche, sans frais.'}</span></div>
    {#snippet pied()}<button type="button" class="cv-bouton" onclick={() => (quoi = null)}>Garder mon trajet</button><button type="button" class="cv-bouton d" disabled={offre.statut !== 'ouverte'} onclick={() => { agir(() => annulerOffre(offre.id, conducteurId), 'Trajet annulé, voyageurs remboursés'); quoi = null; }}>Annuler le trajet</button>{/snippet}
  </Feuille>

  <FeuilleProbleme bind:ouvert={ferme('probleme').get, ferme('probleme').set} offreId={offre.id} auteurId={conducteurId} motifs={['Un passager n’est pas venu', 'Passager en retard', 'Comportement inquiétant', 'Paiement ou versement', 'Problème avec mon véhicule', 'Autre problème']} />
  <FeuilleAvis bind:ouvert={() => !!pourAvis, (v) => { if (!v) pourAvis = null; }} offreId={offre.id} deId={conducteurId} pourId={pourAvis} role="passager" />
{/if}

<style>
  .piste { position: relative; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.12); margin: 14px 12px 4px; }
  .piste i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: linear-gradient(90deg, #8b7cff, #3de0ff); transition: width 0.6s; }
  .piste span { position: absolute; top: 50%; width: 32px; height: 32px; margin: -16px 0 0 -16px; border-radius: 50%; display: grid; place-items: center; background: #f2f4ff; color: #06080f; box-shadow: 0 6px 16px -4px rgba(61, 224, 255, 0.8); transition: left 0.6s; }
  .passager :global(.inp) { flex: 1; min-width: 0; }
</style>
