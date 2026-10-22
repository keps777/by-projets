<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
</script>

<Ecran titre="Page introuvable" sansRetour>
  <p class="muted">Cette page n'existe pas (ou pas encore).</p>
  <Bouton href="/">Retour à l'accueil</Bouton>
</Ecran>
