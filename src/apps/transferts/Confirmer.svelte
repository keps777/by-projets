<script lang="ts">
  import Verifier from './Verifier.svelte';
  /** Transférer, étape 2 : confirmer (échéance lointaine). */
  let { droitId = '' }: { droitId?: string } = $props();
</script>
<Verifier {droitId} mode="confirmer" />
