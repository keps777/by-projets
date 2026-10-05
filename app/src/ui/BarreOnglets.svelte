<script lang="ts">
  import Icone from './Icone.svelte';
  import type { NomIcone } from './icones.ts';
  import { routeur } from '../routeur.svelte.ts';

  const ONGLETS: { href: string; label: string; icone: NomIcone; actifSur: string[] }[] = [
    { href: '/', label: 'Le Fil', icone: 'fil', actifSur: ['/', '/semaine', '/mois', '/recherche', '/tache', '/focus', '/action-rapide'] },
    { href: '/projets', label: 'Projets', icone: 'projets', actifSur: ['/projets'] },
    { href: '/rapports', label: 'Rapports', icone: 'rapports', actifSur: ['/rapports'] },
    { href: '/archive', label: 'Archive', icone: 'archive', actifSur: ['/archive'] },
    { href: '/reglages', label: 'Réglages', icone: 'reglages', actifSur: ['/reglages'] }
  ];
  const actif = (o: (typeof ONGLETS)[number]) => o.actifSur.some((p) => (p === '/' ? routeur.chemin === '/' : routeur.chemin === p || routeur.chemin.startsWith(p + '/')));
</script>

<nav aria-label="Navigation principale">
  {#each ONGLETS as o (o.href)}
    <a href={o.href} class:actif={actif(o)} aria-current={actif(o) ? 'page' : undefined}><Icone nom={o.icone} /><span>{o.label}</span></a>
  {/each}
</nav>

<style>
  nav { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); padding: 6px 4px max(14px, calc(var(--bas-sûr) + 2px)); border-top: 1px solid var(--ligne); background: var(--fond); flex: none; }
  a { min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 11px; font-weight: 500; color: var(--muted); }
  a.actif { color: var(--texte); font-weight: 600; }
</style>
