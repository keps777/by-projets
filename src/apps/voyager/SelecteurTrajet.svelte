<script lang="ts">
  /** CONTRAT (remplacé par l'agent « trajet ») : fenêtre « Où vas-tu ? » qui se déroule depuis la ligne de trajet de l'accueil. Lit/écrit la tranche `recherche`. */
  let { ouvert = $bindable(false), onappliquer }: { ouvert?: boolean; onappliquer?: () => void } = $props();
</script>

{#if ouvert}
  <div class="voile" role="presentation" onclick={() => (ouvert = false)}></div>
  <div class="gl" role="dialog" aria-label="Où vas-tu ?" style="position: fixed; left: 14px; right: 14px; top: 70px; z-index: 60">
    <button type="button" class="b p" onclick={() => { onappliquer?.(); ouvert = false; }}>Voir les départs</button>
  </div>
{/if}
