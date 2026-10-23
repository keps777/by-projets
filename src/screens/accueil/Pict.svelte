<script lang="ts">
  /** Pictogrammes propres à l'accueil et aux paiements (le kit Icone n'est pas modifiable). */
  let { nom, taille = 20, trait = 1.8, plein = false }: { nom: string; taille?: number; trait?: number; plein?: boolean } = $props();
  const CHEMINS: Record<string, string> = {
    etoile: 'm12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z',
    partage: 'M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6',
    copier: 'M9 9h10v11H9zM5 15V4h10',
    lampe: 'M9 3h6l-1 6h3l-7 12 1-8H7z',
    telecharger: 'M12 4v11M8 11l4 4 4-4M5 20h14',
    envoyer: 'M4 12 20 4l-5 16-3-7z',
    carte: 'M3 6h18v12H3zM3 10h18M7 15h4',
    cadenas: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
    face: 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 10v1.5M15 10v1.5M9 15c1.5 1.3 4.5 1.3 6 0',
    efface: 'M21 5H9l-6 7 6 7h12zM12 9l5 6M17 9l-5 6',
    pile: 'M12 3 21 8l-9 5-9-5zM3 13l9 5 9-5'
  };
</script>

<svg width={taille} height={taille} viewBox="0 0 24 24" fill={plein ? 'currentColor' : 'none'} stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={CHEMINS[nom] ?? CHEMINS.etoile} /></svg>
