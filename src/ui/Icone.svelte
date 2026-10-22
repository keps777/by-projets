<script lang="ts">
  /** Icônes trait 1.8 (24×24). Ajouter un nom = ajouter une ligne dans CHEMINS. */
  let { nom, taille = 20, trait = 1.8 }: { nom: string; taille?: number; trait?: number } = $props();
  const CHEMINS: Record<string, string> = {
    retour: 'M15 5 8 12l7 7', suivant: 'm9 5 7 7-7 7', fermer: 'M6 6l12 12M18 6 6 18', ok: 'm5 12.5 4.5 4.5L19 7.5',
    accueil: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z', coffre: 'M4 8h16v11H4zM8 8V6a4 4 0 0 1 8 0v2M12 12v3',
    score: 'M5 19V11M12 19V5M19 19v-6', profil: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20c1-4 4-6 8-6s7 2 8 6',
    scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
    cloche: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0', historique: 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4M12 8v4l3 2',
    recharge: 'M12 5v14M5 12h14', payer: 'M4 8h16v10H4zM4 11h16M7 15h3', sante: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z',
    ecole: 'm3 9 9-5 9 5-9 5zM7 11.5V16c1.5 1.5 3.2 2 5 2s3.5-.5 5-2v-4.5', logement: 'M4 20V9l8-5 8 5v11zM10 20v-6h4v6',
    auto: 'M5 16h14l-1.5-5.5a2 2 0 0 0-2-1.5h-7a2 2 0 0 0-2 1.5zM7 16v2M17 16v2M7.5 13h.01M16.5 13h.01',
    solaire: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5',
    diaspora: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', commerce: 'M4 9h16l-1 10H5zM8 9V7a4 4 0 0 1 8 0v2',
    protection: 'M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z', verrou: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3', oeil: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    empreinte: 'M7 12a5 5 0 0 1 10 0c0 3 0 5-1 7M9 20c1-2 1-5 1-8a2 2 0 0 1 4 0c0 2 0 4-.5 6M4 12a8 8 0 0 1 16 0', attention: 'M12 4 3 20h18zM12 10v4M12 17h.01',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v5M12 8h.01', fleche: 'M5 12h14m-6-6 6 6-6 6', plus: 'M12 5v14M5 12h14', telephone: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM11 18h2',
    camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z', photo: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01', document: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h6M10 16h6',
    pharmacie: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z', carte: 'M3 6h18v12H3zM3 10h18', calendrier: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', parametres: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19 12l2-1-1.5-3-2.2.7-1.5-1.3-.3-2.3h-3.4l-.3 2.3-1.5 1.3-2.2-.7L5.6 11l2 1v0l-2 1 1.5 3 2.2-.7 1.5 1.3.3 2.3h3.4l.3-2.3 1.5-1.3 2.2.7 1.5-3z'
  };
</script>

<svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={CHEMINS[nom] ?? CHEMINS.info} /></svg>
