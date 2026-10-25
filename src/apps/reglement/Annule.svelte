<script lang="ts">
  import { param } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { billetParId, personneCourante, type ResultatAnnulation } from '../../domain/actions.ts';
  import AnnuleContenu from './AnnuleContenu.svelte';

  /** Annuler un billet (lien profond `/pass/annule`) : la page Billets affiche le même contenu dans la fenêtre « Annuler ». */
  let fait = $state<ResultatAnnulation | null>(null);
  const billetId = $derived(param('billet'));
  const billet = $derived(billetId ? billetParId(billetId) : undefined), moi = personneCourante();
  const visible = $derived(!!billet && !!moi && (billet.acheteurId === moi.id || billet.passager.tel === moi.tel));
</script>

<Mobile titre={fait ? 'Billet annulé' : 'Annuler ce billet ?'} retourVers={billet ? `/pass?billet=${billet.id}` : '/pass'}>
  {#snippet droite()}{#if visible}<span class="pl {fait ? 'ok' : 'wa'}">{fait ? 'remboursé' : 'réversible'}</span>{/if}{/snippet}
  <AnnuleContenu {billetId} bind:fait />
</Mobile>
