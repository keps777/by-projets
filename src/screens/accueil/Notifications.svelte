<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import ListeNotifs from './ListeNotifs.svelte';
</script>

<Ecran titre="Notifications" retourVers="/">
  <ListeNotifs />
  <div class="espace"></div>
</Ecran>

<style>.espace { height: 80px; }</style>
