<script lang="ts">
  /** Pictogrammes propres aux écrans d'achat, absents du kit (lieu, cadre de scan, proches, chevron bas, passeport). Même grille que `Icone` : viewBox 24, trait arrondi. */
  let { nom, taille = 20, trait = 1.75 }: { nom: 'lieu' | 'scan' | 'proches' | 'bas' | 'bouclier'; taille?: number; trait?: number } = $props();
  const D: Record<string, string> = {
    lieu: 'M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12zM12 11.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z',
    scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3',
    proches: 'M9 11.500a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7zM2.500 20c1-3.500 3.500-5 6.500-5s5.500 1.500 6.500 5M16 4.500a3.500 3.500 0 0 1 0 7M18 15c2 .5 3.200 2 3.500 5',
    bas: 'm5 9 7 7 7-7',
    bouclier: 'M12 3 4 6v6c0 5 3.500 8 8 9 4.500-1 8-4 8-9V6z'
  };
</script>
<svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d={D[nom]} /></svg>
