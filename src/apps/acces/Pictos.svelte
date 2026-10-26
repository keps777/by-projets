<script lang="ts">
  /** Pictogrammes propres à l'accès, absents de `Icone.svelte` (même trait, viewBox 24). */
  let { nom, taille = 20, trait = 2 }: { nom: 'fleche' | 'boussole' | 'renvoyer'; taille?: number; trait?: number } = $props();
  const D: Record<string, string> = { fleche: 'M5 12h14M13 6l6 6-6 6', boussole: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.500 8.500l-2 5-5 2 2-5z', renvoyer: 'M3 12a9 9 0 1 0 3-6.700L3 8M3 3v5h5' };
</script>
<svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d={D[nom]} /></svg>
