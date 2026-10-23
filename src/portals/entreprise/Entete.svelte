<script lang="ts">
  import type { Snippet } from 'svelte';
  import { lien } from './nav.ts';
  /** Bandeau du portail : marque AssureMe, nom de l'espace, actions à droite. */
  let { espace = 'Espace partenaires', droite }: { espace?: string; droite?: Snippet } = $props();
</script>

<header class="entete">
  <a class="marque" href="/portail/entreprise" use:lien aria-label="AssureMe, accueil de l'espace employeur">
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="8" fill="#3050ff" /><path d="M8 20 14 7l6 13M10.6 15.5h6.8" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <b>AssureMe</b>
  </a>
  <span class="espace">{espace}</span>
  <div class="d">{#if droite}{@render droite()}{/if}</div>
</header>

<style>
  .entete { display: flex; align-items: center; gap: 12px; padding: 14px 0; flex-wrap: wrap; }
  .marque { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 18px; }
  .espace { font: 500 11px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .d { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
</style>
