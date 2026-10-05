<script lang="ts">
  import { toasts } from './toast.svelte.ts';
</script>

{#if toasts.message}
  <div class="toast" role="status">{toasts.message}</div>
{/if}

<style>
  .toast { position: fixed; top: calc(14px + var(--haut-sûr)); left: 50%; transform: translateX(-50%); z-index: 90; background: var(--inverse); color: var(--inverse-texte); font-size: 13px; font-weight: 600; padding: 10px 16px; border-radius: 20px; box-shadow: var(--ombre); max-width: 90vw; text-align: center; }
</style>
