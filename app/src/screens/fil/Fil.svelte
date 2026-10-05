<script lang="ts">
  import EcranPage from '../../ui/EcranPage.svelte';
  import { profil } from '../../data/requetes.ts';
</script>

<EcranPage>
  <h1 class="titre">{profil()?.prenom ?? 'Luther'} Life</h1>
  <p class="muted">Le Fil — à venir.</p>
</EcranPage>
