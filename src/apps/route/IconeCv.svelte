<script lang="ts">
  /** Icônes trait (24×24) propres au covoiturage. */
  let { nom, taille = 20, trait = 1.9 }: { nom: string; taille?: number; trait?: number } = $props();
  const C: Record<string, string> = {
    etoile: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z',
    tel: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2',
    bouclier: 'M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6zM8.5 12l2.5 2.5 4.5-5',
    partage: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
    sos: 'M12 3l9.5 17h-19zM12 10v4.5M12 17.5v.5',
    voiture: 'M4 14l1.6-5A2 2 0 0 1 7.5 7.5h9a2 2 0 0 1 1.9 1.5L20 14v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-9v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM6.5 14h11M7.5 16.2h.01M16.5 16.2h.01',
    whatsapp: 'M4 20l1.2-4.1A8 8 0 1 1 8.2 19zM9 9c0 3 3 6 6 6l1.2-1.4-2-1-1 .8a4.5 4.5 0 0 1-2-2l.8-1-1-2z',
    echange: 'M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3',
    bas: 'M6 9l6 6 6-6',
    valide: 'M5 12.5l4.5 4.5L19 7.5',
    position: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11ZM12 10m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
    moto: 'M6 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M18 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M6 17l4-8h5l3 8M10 9l-2-3h3',
    horloge: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
    calendrier: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    appareil: 'M4 8h4l1.5-2h5L16 8h4v11H4zM12 16m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
    plus: 'M12 5v14M5 12h14',
    moins: 'M5 12h14',
    fumee: 'M3 16h13v3H3zM19 16v3M22 16v3M17 5c2 1 2 3 0 4 2 1 2 2 2 3',
    clim: 'M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9M9 4l3 2 3-2M9 20l3-2 3 2',
    sac: 'M7 8h10l1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
    utilisateur: 'M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4.5 20.5a7.5 7.5 0 0 1 15 0',
    carte: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14'
  };
</script>

<svg class="ic" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={C[nom] ?? C.voiture} /></svg>
