<script lang="ts">
  import { statutVerification } from '../../core/covoitProfil.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { personneCourante } from '../../domain/actions.ts';
  import { aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockDuRole } from '../_socle/dockRole.ts';
  import './covoit.css';
  import { choisirMode, profilDe } from './covoitActions.ts';
  import IconeCv from './IconeCv.svelte';
  import ProfilConducteurForm from './ProfilConducteurForm.svelte';

  /** Mon profil conducteur (onglet « Moi » → Je conduis) : même fiche que dans l'onglet Covoiturage ; une fois enregistrée, retour sur Covoiturage en mode Conducteur. */
  const moi = personneCourante(), profil = $derived(profilDe(moi?.id));
  const statut = $derived(profil ? statutVerification(profil, maintenant()) : undefined);
  function fini() { if (moi) choisirMode('conducteur', moi.id); aller(moi?.role === 'conducteur' ? '/covoit/conduire' : '/covoit'); }
</script>

<Mobile titre="Profil conducteur" sous={profil ? 'Modifie tes informations' : 'Obligatoire pour conduire'} retourVers="/moi" dock={dockDuRole(moi?.role, { voyageur: 'moi', terrain: 'trajets' })}>
  {#snippet droite()}{#if profil}<span class="cv-badge {statut === 'verifie' ? 'ok' : 'wa'}"><IconeCv nom="bouclier" taille={12} />{statut === 'verifie' ? 'vérifié' : 'en vérification'}</span>{/if}{/snippet}
  {#if moi}<ProfilConducteurForm personneId={moi.id} onenregistre={fini} titreBouton={profil ? 'Enregistrer les modifications' : 'Enregistrer mon profil'} />{/if}
</Mobile>
