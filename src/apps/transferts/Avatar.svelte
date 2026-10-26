<script lang="ts">
  /** Pastille d'initiales (« LA ») : décorative, le nom est toujours écrit à côté. */
  let { ini }: { ini: string } = $props();
</script>
<span class="avatar" aria-hidden="true">{ini}</span>
<style>.avatar { width: 32px; height: 32px; flex: none; border-radius: 999px; background: #f3f4f6; color: #0d0e11; display: flex; align-items: center; justify-content: center; font: 700 12px/1 'Barlow', sans-serif; }</style>
