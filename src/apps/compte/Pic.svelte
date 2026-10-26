<script lang="ts">
  /** Icônes au trait propres au compte (viewBox 24), en complément de `ui/Icone.svelte`. */
  let { nom, taille = 22, trait = 1.75 }: { nom: string; taille?: number; trait?: number } = $props();
  const P: Record<string, string> = {
    fleche: 'M5 12h14M13 6l6 6-6 6', enfant: 'M6 4v9h12M14 9l4 4-4 4', telecharger: 'M12 4v11M7 11l5 5 5-5M5 20h14', curseurs: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
    message: 'M4 5h16v11H9l-5 4z', etiquette: 'M3 12V4h8l10 10-8 8zM7.5 8h.01', poubelle: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13', quitter: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
    chevron: 'm9 5 7 7-7 7', telephone: 'M7 2h10v20H7zM11 18h2', courriel: 'M3 5h18v14H3zM3 7l9 6 9-6', cadenas: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', bas: 'm6 9 6 6 6-6', ok: 'm5 12.5 4.5 4.5L19 7', carte: 'M3 5h18v14H3zM3 10h18M6 15h4', eclair: 'M13 2 4 14h7l-1 8 9-12h-7z', horloge: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
    echeance: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2', sac: 'M7 8h10v12H7zM10 8V5h4v3M9 12v5M15 12v5', portefeuille: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2ZM16 14.5h.01',
    cloche: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21h4', cloche_barree: 'M6 16v-5a6 6 0 0 1 9-5.2M18 11v5l2 2H4M10 21h4M4 4l16 16', globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    bouclier: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM9 12l2 2 4-4', identite: 'M3 5h18v14H3zM9 11a2 2 0 1 0 0-.1M6 16c.8-1.3 1.8-2 3-2s2.2.7 3 2M14 10h4M14 13h3', cle: 'M15 8a4 4 0 1 1-1.2 2.8L4 20v-3l2-1v-2l2-1 1-1.5',
    avion: 'M3 13h6l4 7h2l-2-7h5l2 2h2l-1-3 1-3h-2l-2 2h-5l2-7h-2l-4 7H3z', livre: 'M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h12', retour: 'm15 5-7 7 7 7', plus: 'M12 5v14M5 12h14', alerte: 'M12 3 2 20h20zM12 10v4M12 17h.01',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01', hors: 'M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0M9.5 17a4 4 0 0 1 5 0M4 4l16 16', chercher: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-5-5', fermer: 'M6 6l12 12M18 6 6 18',
    etoile: 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z', soleil: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4', lune: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z', moins: 'M5 12h14'
  };
</script>
<svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d={P[nom] ?? P.info} /></svg>
