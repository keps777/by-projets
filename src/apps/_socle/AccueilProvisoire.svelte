<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import { compteCourant, deconnecter } from '../../domain/compte.ts';
  import { aller } from '../../router.svelte.ts';
  /** Accueil provisoire : l'accueil double face (Voyager ⇄ Mes actifs) arrive à la phase « recto ». */
  const compte = $derived(compteCourant());
</script>
<Ecran titre="Accueil" onglet="accueil" face="jour">
  <section class="col g8"><p class="t-sec">Bonjour {compte?.prenom ?? ''}</p><h2 class="t-h1">Le monde, à partir de <span style="color:var(--accent)">Montréal</span></h2></section>
  <div class="carte col g12"><p class="t-sec">Votre espace est prêt. L’accueil, la recherche, les drops et le portefeuille arrivent avec la prochaine phase.</p>
    <button type="button" class="btn sec" onclick={() => { deconnecter(); aller('/ouverture'); }}>Se déconnecter</button></div>
</Ecran>
