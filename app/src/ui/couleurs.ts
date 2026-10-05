// Couleurs des rubriques : la couleur d'origine est celle de la nuit ; en mode jour, les rubriques par défaut ont une variante plus foncée.
const JOUR: Record<string, string> = { '#9D8CFF': '#5B4FE0', '#34D1B6': '#0B7F72', '#5EA6FF': '#2B67A8', '#FF8F66': '#B4542F', '#F5B843': '#A66D00', '#A3A6B1': '#6B6E76' };

/** Teintes exactes des maquettes (design/maquettes-v2/Main.dc.html) pour chaque couleur par défaut, nuit puis jour. */
const TEINTES: Record<string, { fond: string; encre: string; rempli: string; sur: string }> = {
  '#9D8CFF': { fond: '#262143', encre: '#DCD5FF', rempli: 'rgba(157,140,255,0.36)', sur: '#120E2E' },
  '#34D1B6': { fond: '#102D29', encre: '#B4F1E6', rempli: 'rgba(52,209,182,0.30)', sur: '#04241F' },
  '#5EA6FF': { fond: '#14253D', encre: '#CFE3FF', rempli: 'rgba(94,166,255,0.30)', sur: '#06182E' },
  '#FF8F66': { fond: '#381F17', encre: '#FFD9CA', rempli: 'rgba(255,143,102,0.30)', sur: '#2E1006' },
  '#F5B843': { fond: '#33280F', encre: '#FBE4B2', rempli: 'rgba(245,184,67,0.28)', sur: '#2A1C00' },
  '#A3A6B1': { fond: '#2A2C35', encre: '#E3E4EA', rempli: 'rgba(163,166,177,0.28)', sur: '#16171D' },
  '#5B4FE0': { fond: '#E9E6FD', encre: '#2C2380', rempli: 'rgba(91,79,224,0.24)', sur: '#FFFFFF' },
  '#0B7F72': { fond: '#DCF0EC', encre: '#08524A', rempli: 'rgba(11,127,114,0.22)', sur: '#FFFFFF' },
  '#2B67A8': { fond: '#DFEAF6', encre: '#183F6A', rempli: 'rgba(43,103,168,0.22)', sur: '#FFFFFF' },
  '#B4542F': { fond: '#F5E2D9', encre: '#6E2E14', rempli: 'rgba(180,84,47,0.22)', sur: '#FFFFFF' },
  '#A66D00': { fond: '#F7ECD2', encre: '#5E3E00', rempli: 'rgba(176,116,0,0.24)', sur: '#FFFFFF' },
  '#6B6E76': { fond: '#E7E5E0', encre: '#3A3B42', rempli: 'rgba(107,110,118,0.22)', sur: '#FFFFFF' }
};

export function couleurRubrique(couleur: string, mode: 'nuit' | 'jour'): string {
  return mode === 'jour' ? JOUR[couleur.toUpperCase()] ?? couleur : couleur;
}

/** Teintes d'une couleur (déjà résolue pour le mode) : celles des maquettes pour les couleurs par défaut, un mélange sinon. */
export function teintes(couleur: string): { fond: string; encre: string; rempli: string; sur: string } {
  return TEINTES[couleur.toUpperCase()] ?? {
    fond: `color-mix(in srgb, ${couleur} 14%, var(--surface))`,
    encre: `color-mix(in srgb, ${couleur} 62%, var(--texte))`,
    rempli: `color-mix(in srgb, ${couleur} 30%, transparent)`,
    sur: `color-mix(in srgb, ${couleur} var(--sur-teinte), var(--sur-base))`
  };
}

/** Style CSS d'un élément coloré : --c (couleur), --c-fond (fond doux), --c-encre (texte sur le fond doux), --c-rempli (remplissage translucide), --c-sur (texte sur la couleur pleine). */
export function styleCouleur(couleur: string): string {
  const t = teintes(couleur);
  return `--c:${couleur};--c-fond:${t.fond};--c-encre:${t.encre};--c-rempli:${t.rempli};--c-sur:${t.sur}`;
}
