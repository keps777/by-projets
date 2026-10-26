<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import { compteCourant, deconnecter } from '../../domain/compte.ts';
  import { aller } from '../../router.svelte.ts';
  /** Accueil provisoire : l'accueil double face (Voyager ⇄ Mes actifs) arrive à la phase « recto ». */
  const compte = $derived(compteCourant());
</script>
<Ecran titre="Accueil" onglet="accueil" face="jour">
  <section class="col g8"><p class="t-sec">{compte ? `Bonjour ${compte.prenom}` : 'Bienvenue sur NexG-TT'}</p><h2 class="t-h1">Le monde, à partir de <span style="color:var(--accent)">Montréal</span></h2></section>
  {#if compte}
    <div class="carte col g12"><p class="t-sec">Votre espace est prêt. L’accueil, la recherche, les drops et le portefeuille arrivent avec la prochaine phase.</p>
      <button type="button" class="btn sec" onclick={() => { deconnecter(); aller('/ouverture'); }}>Se déconnecter</button></div>
  {:else}
    <div class="carte col g12"><p class="t-sec">L’exploration sans compte arrive avec la prochaine phase. En attendant, créez votre compte en une minute.</p>
      <button type="button" class="btn" onclick={() => aller('/inscription')}>Créer un compte</button>
      <button type="button" class="btn sec" onclick={() => aller('/connexion')}>J’ai déjà un compte</button></div>
  {/if}
</Ecran>
