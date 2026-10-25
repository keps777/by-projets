<script lang="ts">
  /** CONTRAT (remplacé par l'agent « filtres ») : fenêtre de filtres et de tri (Heure, Prix, Places, Confort) de l'accueil. Lit/écrit la tranche `recherche`. */
  let { ouvert = $bindable(false) }: { ouvert?: boolean } = $props();
</script>

{#if ouvert}
  <div class="voile" role="presentation" onclick={() => (ouvert = false)}></div>
  <div class="sheet" role="dialog" aria-label="Filtres" style="position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; margin: 0">
    <button type="button" class="b p" onclick={() => (ouvert = false)}>Voir les départs</button>
  </div>
{/if}
