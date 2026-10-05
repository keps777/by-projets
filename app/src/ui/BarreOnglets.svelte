<script lang="ts">
  import Icone from './Icone.svelte';
  import type { NomIcone } from './icones.ts';
  import { routeur } from '../routeur.svelte.ts';
  import { chronos } from '../data/chronos.svelte.ts';
  /** `filet` : trait au-dessus de la barre (absent sur la planche du Fil). */
  let { filet = true }: { filet?: boolean } = $props();

  const ONGLETS: { href: string; label: string; icone: NomIcone; actifSur: string[] }[] = [
    { href: '/', label: 'Le Fil', icone: 'fil', actifSur: ['/', '/semaine', '/mois', '/recherche', '/tache', '/focus', '/action-rapide', '/carnet'] },
    { href: '/projets', label: 'Projets', icone: 'projets', actifSur: ['/projets'] },
    { href: '/rapports', label: 'Rapports', icone: 'rapports', actifSur: ['/rapports'] },
    { href: '/archive', label: 'Archive', icone: 'archive', actifSur: ['/archive'] },
    { href: '/reglages', label: 'Réglages', icone: 'reglages', actifSur: ['/reglages'] }
  ];
  const actif = (o: (typeof ONGLETS)[number]) => o.actifSur.some((p) => (p === '/' ? routeur.chemin === '/' : routeur.chemin === p || routeur.chemin.startsWith(p + '/')));
</script>

<nav aria-label="Navigation principale" class:sans-filet={!filet}>
  {#each ONGLETS as o (o.href)}
    <a href={o.href} class:actif={actif(o)} aria-current={actif(o) ? 'page' : undefined}><span class="ico"><Icone nom={o.icone} />{#if o.href === '/rapports' && chronos.actifs.length}<span class="pastille" aria-label="Chrono en cours" role="img"></span>{/if}</span><span>{o.label}</span></a>
  {/each}
</nav>

<style>
  nav { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); padding: 6px 4px max(14px, calc(var(--bas-sûr) + 2px)); border-top: 1px solid var(--ligne); background: var(--fond); flex: none; }
  a { min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 11px; font-weight: 500; color: var(--muted); }
  a.actif { color: var(--texte); font-weight: 600; }
  nav.sans-filet { border-top-color: transparent; }
  .ico { position: relative; display: inline-flex; }
  .pastille { position: absolute; top: -2px; right: -5px; width: 9px; height: 9px; border-radius: 5px; background: var(--maintenant); box-shadow: 0 0 0 2px var(--fond); animation: battre-onglet 1.2s ease-in-out infinite; }
  @keyframes battre-onglet { 50% { opacity: 0.35; } }
</style>
