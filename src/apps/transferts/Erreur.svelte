<script lang="ts">
  import { param } from '../../router.svelte.ts';
  import { compteCourant, compteDe } from '../../domain/compte.ts';
  import { droitDe } from '../../domain/marche.ts';
  import { brouillonDe, etatTransfert, nomCourt, trancheTransferts } from '../../domain/transfert.ts';
  import ErreurVue from './ErreurVue.svelte';
  import Introuvable from './Introuvable.svelte';
  import { casConnu, lieAuCompte, motifConnu } from './vues.ts';

  /** Transfert non effectué : l'échec enregistré dans le brouillon (réseau, droit non transférable, échéance, destinataire inactif, incident). `?cas=` / `?motif=` montrent un autre cas. */
  let { droitId = '' }: { droitId?: string } = $props();
  trancheTransferts();
  const compte = $derived(compteCourant());
  const droit = $derived(droitId ? droitDe(droitId) : undefined);
  const b = $derived(droitId ? brouillonDe(droitId) : undefined);
  const cas = $derived(casConnu(param('cas')) ?? b?.erreur?.cas ?? 'technique');
  const motif = $derived(motifConnu(param('motif')) ?? b?.erreur?.motif);
  const versNom = $derived(b?.versId ? (compteDe(b.versId) ? nomCourt(compteDe(b.versId)!) : undefined) : b?.erreur?.versNom);
  const echeance = $derived(compte && droit ? etatTransfert(droitId, compte.id).echeance : undefined);
</script>
{#if !droitId}
  <!-- ancien écran réinstancié brièvement au changement de route : rien à montrer -->
{:else if !compte || !droit || !lieAuCompte(droit, compte.id)}
  <Introuvable />
{:else}
  <ErreurVue {droitId} {cas} {motif} {versNom} incident={b?.erreur?.incident ?? (cas === 'technique' ? 'INC-4F9K' : undefined)} {echeance} />
{/if}
