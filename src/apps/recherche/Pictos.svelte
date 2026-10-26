<script lang="ts" module>
  export type Nom = 'reglages' | 'etiquette' | 'agence' | 'baisse' | 'hausse' | 'sac' | 'identite' | 'bouclier' | 'message' | 'voyageurs' | 'cadenas' | 'bouclier-ok' | 'calendrier' | 'cloche' | 'lune' | 'suivant' | 'avion' | 'chercher' | 'echange' | 'ok' | 'alerte' | 'fermer' | 'info' | 'retour' | 'trier' | 'eclair' | 'transfert' | 'registre' | 'horsligne';
</script>
<script lang="ts">
  /** Pictogrammes de la recherche absents de `Icone.svelte` (même trait, viewBox 24). */
  let { nom, taille = 20, trait = 1.75 }: { nom: Nom; taille?: number; trait?: number } = $props();
  const D: Record<Nom, string> = {
    reglages: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', etiquette: 'M3 12V4h8l10 10-8 8zM9 7.500a1.500 1.500 0 1 1-3 0 1.500 1.500 0 0 1 3 0Z',
    agence: 'M4 9l1.500-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6', baisse: 'm4 8 6 6 4-4 6 7M15 17h5v-5', hausse: 'm4 16 6-6 4 4 6-7M15 7h5v5',
    sac: 'M7 7h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM9 7V4h6v3M9 11v5M15 11v5', identite: 'M3 5h18v14H3zM9 11a2 2 0 1 0 0-.1M6 16c.8-1.300 1.800-2 3-2s2.200.700 3 2M14 10h4M14 13h3',
    bouclier: 'M12 3 4 6v6c0 5 3.500 8 8 9 4.500-1 8-4 8-9V6z', 'bouclier-ok': 'M12 3 4 6v6c0 5 3.500 8 8 9 4.500-1 8-4 8-9V6zM9 12l2 2 4-4', message: 'M4 5h16v11H9l-5 4z',
    voyageurs: 'M9 11.500a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7ZM2.500 20c1-3.500 3.500-5 6.500-5s5.500 1.500 6.500 5M16 4.500a3.500 3.500 0 0 1 0 7M18 15c2 .5 3.200 2 3.500 5',
    cadenas: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3', calendrier: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4', cloche: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21h4', lune: 'M20 14.500A8 8 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z',
    suivant: 'm9 5 7 7-7 7', avion: 'M3 13h6l4 7h2l-2-7h5l2 2h2l-1-3 1-3h-2l-2 2h-5l2-7h-2l-4 7H3z', chercher: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.500-3.500', echange: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
    ok: 'm5 12 5 5 9-10', alerte: 'M12 3 2 20h20zM12 10v4M12 17h.01', fermer: 'M6 6l12 12M18 6 6 18', info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01', retour: 'm15 5-7 7 7 7',
    trier: 'M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3', eclair: 'M13 2 4 14h7l-1 8 9-12h-7z', transfert: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7', registre: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3', horsligne: 'M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0M9.500 17a4 4 0 0 1 5 0M4 4l16 16'
  };
</script>
<svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d={D[nom]} /></svg>
