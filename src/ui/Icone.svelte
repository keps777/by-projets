<script lang="ts">
  /** Icônes au trait (viewBox 24, trait 1,75), reprises des maquettes. `nom` : voir la table `I`. */
  let { nom, taille = 22, trait = 1.75, titre }: { nom: string; taille?: number; trait?: number; titre?: string } = $props();
  const I: Record<string, string> = {
    retour: 'm15 5-7 7 7 7', suivant: 'm9 5 7 7-7 7', fermer: 'M6 6l12 12M18 6 6 18', cloche: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21h4', moi: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-4 3.6-6 8-6s8 2 8 6',
    accueil: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', chercher: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-5-5', drops: 'M13 2 4 14h7l-1 8 9-12h-7z', portefeuille: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2ZM16 14.5h.01',
    courriel: 'M3 5h18v14H3zM3 7l9 6 9-6', telephone: 'M7 2h10v20H7zM11 18h2', cadenas: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', cle: 'M15 8a4 4 0 1 1-1.2 2.8L4 20v-3l2-1v-2l2-1 1-1.5', empreinte: 'M12 11v4M8 20c1-2 1-4 1-6a3 3 0 0 1 6 0c0 3-.5 5-1.5 7M5 17c.6-1.600 1-3.200 1-5a6 6 0 0 1 12 0c0 1.200-.1 2.300-.3 3.300M4 9.500A9 9 0 0 1 12 3a9 9 0 0 1 8 5',
    verifie: 'M12 3 4 6v6c0 4.500 3.200 7.800 8 9 4.800-1.200 8-4.500 8-9V6zM8.500 12l2.500 2.500 4.500-5', ok: 'm5 12.500 4.500 4.500L19 7', globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    avion: 'M3 13h6l4 7h2l-2-7h5l2 2h2l-1-3 1-3h-2l-2 2h-5l2-7h-2l-4 7H3z', calendrier: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', horloge: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2', carte: 'M3 5h18v14H3zM3 10h18M3 3l18 18', carteok: 'M3 5h18v14H3zM3 10h18M6 15h4',
    piece: 'M3 5h18v14H3zM9 11a2 2 0 1 0 0-.1M6 16c.8-1.300 1.800-2 3-2s2.200.700 3 2M14 10h4M14 13h3', info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01', alerte: 'M12 3 2 20h20zM12 10v4M12 17h.01', oeil: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    etoile: 'm12 3 2.700 5.600 6.100.8-4.500 4.200 1.100 6.100L12 16.800 6.600 19.700l1.100-6.100L3.200 9.400l6.100-.8z', billet: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM14 6v12', sac: 'M7 8h10v12H7zM10 8V5h4v3M9 12v5M15 12v5',
    echange: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7', soleil: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.900 4.900l1.400 1.400M17.700 17.700l1.400 1.400M2 12h2M20 12h2M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400', lune: 'M20 14.500A8 8 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z',
    rond: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', plus: 'M12 5v14M5 12h14', moins: 'M5 12h14', partager: 'M8 12 16 7M8 12l8 5M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', hors_ligne: 'M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0M9.500 17a4 4 0 0 1 5 0M4 4l16 16'
  };
</script>

<svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden={titre ? undefined : 'true'} role={titre ? 'img' : undefined} aria-label={titre} style="flex:none">{#if titre}<title>{titre}</title>{/if}<path d={I[nom] ?? I.info} /></svg>
