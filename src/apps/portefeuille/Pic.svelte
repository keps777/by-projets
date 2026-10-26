<script lang="ts">
  /** Pictogrammes du verso absents de `Icone.svelte` (même trait, viewBox 24). */
  type Nom = 'hausse' | 'baisse' | 'stable' | 'etiquette' | 'chevron' | 'bas' | 'soute' | 'pause' | 'lecture' | 'proche' | 'croix' | 'coche' | 'identite' | 'importer' | 'retourner' | 'cadenas' | 'fleche' | 'transfert' | 'echange' | 'recu' | 'rachat';
  let { nom, taille = 18, trait = 2 }: { nom: Nom; taille?: number; trait?: number } = $props();
  const D: Record<Nom, string> = {
    hausse: 'm4 16 6-6 4 4 6-7M15 7h5v5', baisse: 'm4 8 6 6 4-4 6 7M15 17h5v-5', stable: 'M5 12h14', etiquette: 'M3 12V4h8l10 10-8 8zM7.500 7.500h.01', chevron: 'm9 5 7 7-7 7', bas: 'm5 9 7 7 7-7',
    soute: 'M5 7h14v13H5zM9 7V4h6v3M9 11v5M15 11v5', pause: 'M8 5v14M16 5v14', lecture: 'M7 5v14l12-7z', proche: 'M9 11.500a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7ZM2.500 20c1-3.500 3.500-5 6.500-5s5.500 1.500 6.500 5M16 4.500a3.500 3.500 0 0 1 0 7M18 15c2 .5 3.200 2 3.500 5',
    croix: 'M6 6l12 12M18 6 6 18', coche: 'm5 12 5 5 9-10', identite: 'M3 5h18v14H3zM9 11a2 2 0 1 0 0-.1M6 16c.8-1.300 1.800-2 3-2s2.200.700 3 2M14 10h4M14 13h3',
    importer: 'M12 4v11M7 10l5 5 5-5M5 20h14', retourner: 'M4 12a8 8 0 0 1 14-5.300M20 4v4h-4M20 12a8 8 0 0 1-14 5.300M4 20v-4h4', cadenas: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', fleche: 'M5 12h14M13 6l6 6-6 6',
    transfert: 'M3 12h14M13 6l6 6-6 6', echange: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7', recu: 'M12 4v11M7 10l5 5 5-5M5 20h14', rachat: 'M4 7h16v10H4zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4 10h2M18 14h2'
  };
</script>
<svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d={D[nom]} /></svg>
