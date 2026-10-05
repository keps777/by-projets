<script lang="ts">
  import EcranPage from '../../ui/EcranPage.svelte';
  import EnTete from '../../ui/EnTete.svelte';
  let { params: _ = {} }: { params?: Record<string, string> } = $props();
</script>

<EcranPage>
  <EnTete titre="Export" />
  <p class="muted">À venir.</p>
</EcranPage>
