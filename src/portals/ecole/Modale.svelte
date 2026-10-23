<script lang="ts">
  import type { Snippet } from 'svelte';
  /** Fenêtre de confirmation du portail (centrée, fermeture par Échap ou clic sur le fond). */
  let { ouverte = $bindable(false), titre, children }: { ouverte?: boolean; titre: string; children: Snippet } = $props();
  let boite: HTMLDivElement | undefined = $state();
  $effect(() => { if (ouverte) boite?.focus(); });
</script>

{#if ouverte}
  <div class="voile" role="presentation" onclick={() => (ouverte = false)}></div>
  <div class="modale" role="dialog" aria-modal="true" aria-label={titre} tabindex="-1" bind:this={boite} onkeydown={(e) => e.key === 'Escape' && (ouverte = false)}>
    <h2>{titre}</h2>
    {@render children()}
  </div>
{/if}

<style>
  .voile { position: fixed; inset: 0; background: rgba(15, 20, 34, 0.45); z-index: 40; }
  .modale { position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(92vw, 460px); background: var(--carte); color: var(--texte); border-radius: 18px; padding: 22px; box-shadow: var(--ombre); display: flex; flex-direction: column; gap: 14px; outline: none; }
  h2 { font-size: 19px; }
</style>
