<script lang="ts">
  /** Pictogrammes au trait des planches « bagages » et « intentions » (viewBox 24, repris des maquettes). Contenu constant : pas d'entrée utilisateur dans le SVG. */
  let { nom, taille = 20, trait = 2, titre }: { nom: string; taille?: number; trait?: number; titre?: string } = $props();
  const I: Record<string, string> = {
    retour: '<path d="m15 5-7 7 7 7"/>', suivant: '<path d="m9 5 7 7-7 7"/>', ok: '<path d="m5 12 5 5 9-10"/>', croix: '<path d="M6 6l12 12M18 6 6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>', moins: '<path d="M5 12h14"/>',
    etiquette: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>', avion: '<path d="M3 13h6l4 7h2l-2-7h5l2 2h2l-1-3 1-3h-2l-2 2h-5l2-7h-2l-4 7H3z"/>',
    tendance: '<path d="m4 8 6 6 4-4 6 7"/><path d="M15 17h5v-5"/>', cadenas: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    reserve: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>', reserveOk: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/><path d="M12 15v2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', alerte: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>', echange: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    regle: '<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M7 8v3M11 8v3M15 8v3M19 8v3"/>', bouclier: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>', bouclierOk: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', personne: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>', groupe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .5 3.2 2 3.5 5"/>',
    fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>', rejouer: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', etincelle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', carte: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>', portefeuille: '<path d="M3 7a2 2 0 0 1 2-2h12v4"/><rect x="3" y="9" width="18" height="11" rx="2"/><path d="M16 14.5h1.5"/>',
    mobile: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>', identite: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.8-1.3 1.8-2 3-2s2.2.7 3 2M14 10h4M14 13h3"/>',
    inverser: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>', chances: '<path d="M6 20v-5M12 20V9M18 20V4"/>'
  };
</script>
<svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round" aria-hidden={titre ? undefined : 'true'} role={titre ? 'img' : undefined} aria-label={titre} style="flex:none">{@html I[nom] ?? I.info}</svg>
