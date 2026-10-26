<script lang="ts" module>
  export type Onglet = 'accueil' | 'rechercher' | 'drops' | 'portefeuille' | 'compte';
</script>

<script lang="ts">
  import { aller } from '../router.svelte.ts';
  import Icone from './Icone.svelte';
  /** Barre de navigation : 5 onglets, libellés toujours visibles, cibles ≥ 48 px, onglet courant en accent (`aria-current="page"`). Sur PC elle passe en haut de page. */
  let { actif }: { actif?: Onglet } = $props();
  const ONGLETS: { id: Onglet; label: string; href: string; icone: string }[] = [
    { id: 'accueil', label: 'Accueil', href: '/', icone: 'accueil' }, { id: 'rechercher', label: 'Rechercher', href: '/rechercher', icone: 'chercher' },
    { id: 'drops', label: 'Drops', href: '/drops', icone: 'drops' }, { id: 'portefeuille', label: 'Portefeuille', href: '/portefeuille', icone: 'portefeuille' }, { id: 'compte', label: 'Compte', href: '/compte', icone: 'moi' }
  ];
</script>
<nav class="nav" aria-label="Navigation principale">
  {#each ONGLETS as o (o.id)}
    <a href={o.href} class:on={actif === o.id} aria-current={actif === o.id ? 'page' : undefined} onclick={(e) => { e.preventDefault(); aller(o.href); }}><Icone nom={o.icone} taille={24} />{o.label}</a>
  {/each}
</nav>
<style>
  .nav { display: grid; grid-template-columns: repeat(5, 1fr); background: var(--surface); border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom); }
  a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 56px; color: var(--ink3); font: 600 12px/14px 'Barlow', sans-serif; letter-spacing: 0.02em; }
  a.on { color: var(--accent); }
  [data-face='jour'] a.on { color: var(--accent); }
  @media (min-width: 900px) { .nav { display: flex; gap: 4px; border: 0; background: transparent; padding: 0; } a { flex-direction: row; gap: 8px; min-height: 44px; padding: 0 16px; border-radius: 999px; font-size: 14px; } a.on { background: var(--accent-soft); } }
</style>
