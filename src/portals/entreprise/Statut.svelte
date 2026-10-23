<script lang="ts">
  import type { StatutAffiche } from './vues.ts';
  let { statut }: { statut: StatutAffiche } = $props();
  const ton = $derived(statut === 'Validé' ? 'primaire' : statut === 'Plafonné' ? 'alerte' : statut === 'Nouveau' ? 'bon' : '');
</script>

<span class="puce {ton}">{statut}</span>
