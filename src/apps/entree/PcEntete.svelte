<script lang="ts">
  import type { Snippet } from 'svelte';
  import Logo from '../../ui/Logo.svelte';
  import { aller } from '../../router.svelte.ts';
  /** En-tête PC (≥ 900 px) des écrans d'entrée qui ont leur propre cadre : logo à gauche, liens du haut à droite (même gabarit que `Ecran` sans onglet). Invisible sur mobile. */
  let { liens }: { liens: Snippet } = $props();
</script>

<header class="nx pc-entete" data-face="jour">
  <a class="marque" href="/" onclick={(e) => { e.preventDefault(); aller('/'); }} aria-label="NexG-TT, accueil"><Logo /></a>
  <nav class="haut-liens" aria-label="Accès au compte">{@render liens()}</nav>
</header>

<style>
  .pc-entete { display: none; }
  @media (min-width: 900px) {
    .pc-entete { grid-area: entete; display: flex; align-items: center; justify-content: space-between; gap: 12px 28px; flex-wrap: wrap; padding: 20px max(32px, calc((100% - 1120px) / 2)) 16px; border-bottom: 1px solid var(--line); }
    .marque { display: inline-flex; align-items: center; min-height: 44px; }
    .haut-liens { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
    .haut-liens :global(a), .haut-liens :global(span[role='link']) { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: 12px; color: var(--accent); font: 700 15px/1 'Barlow', sans-serif; }
    .haut-liens :global(a:hover) { color: var(--accent-2); }
    .haut-liens :global([aria-disabled='true']) { color: var(--ink2); cursor: not-allowed; }
  }
</style>
