<script lang="ts">
  /** Icônes trait (24×24) des maquettes. Ajouter un nom = ajouter une ligne ; les écrans peuvent aussi inliner leurs propres SVG. */
  let { nom, taille = 22, trait = 1.9 }: { nom: string; taille?: number; trait?: number } = $props();
  const C: Record<string, string> = {
    bus: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V17H4zM4 11h16M7 20.5V17M17 20.5V17M7.5 14.5h.01M16.5 14.5h.01', billet: 'M3.5 7.5h17v3a2 2 0 0 0 0 4v3h-17v-3a2 2 0 0 0 0-4z',
    orbe: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', direct: 'M6 18m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M18 6m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M8.5 18H14a3 3 0 0 0 0-6H10a3 3 0 0 1 0-6h5.5',
    moi: 'M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4.5 20.5a7.5 7.5 0 0 1 15 0', retour: 'M15 5l-7 7 7 7', suivant: 'M9 5l7 7-7 7', fermer: 'M6 6l12 12M18 6L6 18', ok: 'M5 12.5l4.5 4.5L19 7.5', plus: 'M12 5v14M5 12h14',
    cloche: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0', visage: 'M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M8.5 9.5v1.5M15.5 9.5v1.5M12 9.5v4h-1.2M9 15.2a4.5 4.5 0 0 0 6 0',
    scan: 'M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M7 12h10', colis: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5L12 12l8-4.5M12 12v9',
    moto: 'M6 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M18 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M6 17l4-8h5l3 8M10 9l-2-3h3', taxi: 'M4 14l1.5-5A2 2 0 0 1 7.4 7.5h9.2a2 2 0 0 1 1.9 1.5L20 14v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-9v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM6.5 14h11',
    groupe: 'M9 8m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M17 9m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M2.5 20a6.5 6.5 0 0 1 13 0M15 19.5a4.5 4.5 0 0 1 6.5-4', cle: 'M8 14m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M11 11l9-7M16 6l2.5 2.5M13.5 8.5L16 11',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v5M12 8h.01', alerte: 'M12 4L3 20h18zM12 10v4M12 17h.01', horloge: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2', carte: 'M3 6h18v12H3zM3 10h18', recherche: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
    micro: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM6 11a6 6 0 0 0 12 0M12 17v4', calendrier: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', pin: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11ZM12 10m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
    argent: 'M3 7h18v10H3zM12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', graphique: 'M5 19V11M12 19V5M19 19v-6', parametres: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19 12l2-1-1.5-3-2.2.7-1.5-1.3-.3-2.3h-3.4l-.3 2.3-1.5 1.3-2.2-.7L5.6 11l2 1-2 1 1.5 3 2.2-.7 1.5 1.3.3 2.3h3.4l.3-2.3 1.5-1.3 2.2.7 1.5-3z'
  };
</script>

<svg class="ic" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={C[nom] ?? C.info} /></svg>
