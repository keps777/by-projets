<script lang="ts">
  import Verifier from './Verifier.svelte';
  /** Transférer, étape 2 : échéance proche (avertissement, seconde case à cocher) ou échéance passée (blocage). */
  let { droitId = '' }: { droitId?: string } = $props();
</script>
<Verifier {droitId} mode="echeance" />
