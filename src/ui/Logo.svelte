<script lang="ts">
  /** Logo NEXG·TT : Barlow Condensed 700, le point médian en accent. */
  let { taille = 26 }: { taille?: number } = $props();
</script>
<span class="logo" style="font-size:{taille}px" aria-label="NexG-TT" role="img"><span aria-hidden="true">NEXG</span><span aria-hidden="true" class="tt">·TT</span></span>
<style>
  .logo { display: inline-flex; align-items: baseline; font: 700 1em/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.06em; color: var(--ink); }
  .tt { color: var(--accent); }
</style>
