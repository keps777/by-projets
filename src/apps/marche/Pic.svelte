<script lang="ts">
  /** Pictogrammes propres au marché (au trait, viewBox 24) qui manquent au kit. */
  let { nom, taille = 18, trait = 2 }: { nom: 'hausse' | 'baisse' | 'etiquette' | 'eclair' | 'etincelle' | 'fleche' | 'flecheg' | 'annuler' | 'portefeuille'; taille?: number; trait?: number } = $props();
  const D = {
    hausse: ['m4 16 6-6 4 4 6-7', 'M15 7h5v5'], baisse: ['m4 8 6 6 4-4 6 7', 'M15 17h5v-5'], etiquette: ['M3 12V4h8l10 10-8 8z', 'M7.5 7.5h.01'], eclair: ['M13 2 4 14h7l-1 8 9-12h-7z'],
    etincelle: ['M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6'], fleche: ['M5 12h14M13 6l6 6-6 6'], flecheg: ['m15 5-7 7 7 7'], annuler: ['M6 6l12 12M18 6 6 18'],
    portefeuille: ['M3 7a2 2 0 0 1 2-2h12v4', 'M5 9h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z', 'M16 14.5h1.5']
  };
</script>
<svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none">{#each D[nom] as d}<path {d} />{/each}</svg>
