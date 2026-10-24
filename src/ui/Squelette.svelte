<script lang="ts">
  let { web = false }: { web?: boolean } = $props();
</script>

<div class={web ? 'web' : 'scr'} aria-busy="true" aria-label="Chargement">
  <div class="bd" style="padding-top: 24px"><div class="sk" style="width: 55%; height: 22px"></div><div class="sk" style="height: 120px; border-radius: 22px"></div><div class="sk" style="width: 80%"></div><div class="sk" style="width: 65%"></div></div>
</div>

<style>
  .web { padding: 40px; display: flex; flex-direction: column; gap: 14px; }
</style>
