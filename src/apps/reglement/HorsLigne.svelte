<script lang="ts">
  import { param } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import HorsLigneContenu from './HorsLigneContenu.svelte';

  /** Billet hors ligne (lien profond `/pass/hors-ligne`) : la page Billets affiche le même contenu dans la fenêtre « Sans réseau ». */
  let hors = $state(false);
  const billetId = $derived(param('billet'));
</script>

<Mobile titre="Sans réseau" retourVers={billetId ? `/pass?billet=${billetId}` : '/pass'}>
  {#snippet droite()}<span class="pl {hors ? 'wa' : 'ok'}">{#if hors}<span class="dot"></span>hors ligne{:else}en ligne{/if}</span>{/snippet}
  <HorsLigneContenu {billetId} bind:hors />
</Mobile>
