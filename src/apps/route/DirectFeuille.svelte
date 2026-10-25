<script lang="ts">
  import Feuille from '../../ui/Feuille.svelte';
  import Direct from './Direct.svelte';
  let { ouvert = $bindable(false), billetId }: { ouvert?: boolean; billetId?: string } = $props();
</script>

<!-- « Suivre ce bus » : tout l'onglet Direct dans une grande fenêtre, sans quitter la page Billets. -->
<Feuille bind:ouvert titre="Ton bus en direct" sous="Position, arrivée estimée, retards" hauteur="haute">
  {#if ouvert}<Direct enFeuille {billetId} />{/if}
</Feuille>
