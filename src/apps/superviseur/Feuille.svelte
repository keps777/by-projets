<script lang="ts">
  import type { Snippet } from 'svelte';
  /** Feuille de confirmation modale (bas d'écran) : voile, Échap et bouton Annuler la ferment, focus sur le premier champ. */
  let { ouvert = $bindable(false), titre, texte = '', confirmer = 'Confirmer', ton = 'p', actif = true, onconfirmer, children }: {
    ouvert?: boolean; titre: string; texte?: string; confirmer?: string; ton?: 'p' | 'd'; actif?: boolean; onconfirmer: () => void; children?: Snippet;
  } = $props();
  let racine: HTMLDivElement | undefined = $state();
  $effect(() => { if (ouvert) queueMicrotask(() => (racine?.querySelector<HTMLElement>('input, textarea, select, button.b') ?? racine)?.focus()); });
</script>

<svelte:window onkeydown={(e) => {
  if (!ouvert) return;
  if (e.key === 'Escape') { ouvert = false; return; }
  if (e.key !== 'Tab' || !racine) return;
  const f = [...racine.querySelectorAll<HTMLElement>('input, textarea, select, button:not(:disabled)')];
  if (!f.length) return;
  const premier = f[0], dernier = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === premier || document.activeElement === racine)) { e.preventDefault(); dernier.focus(); }
  else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
}} />

{#if ouvert}
  <div class="voile" role="presentation" onclick={() => (ouvert = false)}></div>
  <div class="sheet fe" role="dialog" aria-modal="true" aria-label={titre} tabindex="-1" bind:this={racine}>
    <span class="grab"></span>
    <span class="ttl t18 c">{titre}</span>
    {#if texte}<span class="t13 mut c">{texte}</span>{/if}
    {#if children}{@render children()}{/if}
    <div class="col g8">
      <button type="button" class="b {ton === 'd' ? 'd' : 'p'}" disabled={!actif} onclick={() => { onconfirmer(); }}>{confirmer}</button>
      <button type="button" class="b g" onclick={() => (ouvert = false)}>Annuler</button>
    </div>
  </div>
{/if}

<style>
  .voile { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); z-index: 40; }
  .fe { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(100%, 460px); z-index: 41; margin: 0; max-height: 90dvh; overflow-y: auto; outline: none; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
