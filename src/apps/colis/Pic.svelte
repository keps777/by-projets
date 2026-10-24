<script lang="ts">
  /** Petits pictogrammes trait propres à l'application Colis (24×24). */
  let { nom, taille = 20, trait = 2 }: { nom: string; taille?: number; trait?: number } = $props();
  const D: Record<string, string[]> = {
    maison: ['M3 10l9-6 9 6v10H3z', 'M9 20v-6h6v6'], moto: ['M3 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M15 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M6 17l4-8h5l3 8M10 9l-2-3h3'],
    bouclier: ['M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z'], ok: ['M5 12.5l4.5 4.5L19 7.5'], info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 11v5M12 8h.01'],
    appel: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'], colis: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M4 7.5L12 12l8-4.5M12 12v9'],
    photo: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 13.5m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0'], carte: ['M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z', 'M12 10m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'],
    envoyer: ['M4 12l16-8-6 16-2.5-6.5z'], whatsapp: ['M4 20l1.3-4.2A8 8 0 1 1 8.2 18.8z', 'M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z'], carteid: ['M3 6h18v12H3z', 'M7 11m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0', 'M13 10h5M13 14h4M5 16c.5-1.5 3.5-1.5 4 0']
  };
</script>

<svg class="ic" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{#each D[nom] ?? D.info as d (d)}<path {d} />{/each}</svg>
