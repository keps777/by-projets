<script lang="ts">
  import { param } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import type { Litige } from '../../domain/types.ts';
  import LitigeContenu from './LitigeContenu.svelte';

  /** « Signaler un problème » (lien profond `/litige`) : la page Billets et l'écran Direct affichent le même contenu dans une fenêtre. */
  let fait = $state<Litige | null>(null);
</script>

<Mobile titre={fait ? 'Signalement envoyé' : 'Signaler'} retourVers="/moi" dock={dockVoyageur('moi')}>
  {#snippet droite()}<span class="pl {fait ? 'ok' : 'inf'}">{fait ? 'reçu' : '2 h max'}</span>{/snippet}
  <LitigeContenu billetId={param('billet')} colisId={param('colis')} bind:fait />
</Mobile>
