// Couleurs des rubriques : la couleur d'origine est celle de la nuit ; en mode jour, les rubriques par défaut ont une variante plus foncée.
const JOUR: Record<string, string> = { '#9D8CFF': '#5B4FE0', '#34D1B6': '#0B7F72', '#5EA6FF': '#2B67A8', '#FF8F66': '#B4542F', '#F5B843': '#A66D00', '#A3A6B1': '#6B6E76' };

export function couleurRubrique(couleur: string, mode: 'nuit' | 'jour'): string {
  return mode === 'jour' ? JOUR[couleur.toUpperCase()] ?? couleur : couleur;
}

/** Style CSS d'un élément coloré : définit --c (couleur), --c-fond (fond doux) et --c-encre (texte lisible). */
export function styleCouleur(couleur: string): string {
  return `--c:${couleur};--c-fond:color-mix(in srgb, ${couleur} 20%, var(--surface));--c-encre:color-mix(in srgb, ${couleur} 62%, var(--texte));--c-sur:var(--fond)`;
}
