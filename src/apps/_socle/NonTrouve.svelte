<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import { aller } from '../../router.svelte.ts';
</script>
<Ecran titre="Page introuvable" face="jour" sansRetour>
  <div class="col g16 centre" style="padding-top:48px">
    <p class="t-display">404</p>
    <p class="t-sec">Cette page n’existe pas, ou n’existe plus.</p>
    <button type="button" class="btn" onclick={() => aller('/')}>Retour à l’accueil</button>
  </div>
</Ecran>
