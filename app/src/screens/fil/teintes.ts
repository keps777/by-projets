// Teintes des rubriques pour les écrans du Fil : celles de ui/couleurs.ts (exactes pour les couleurs par défaut),
// plus --c-titre, le texte coloré posé sur la feuille (la couleur la nuit, l'encre le jour, comme sel.tink des maquettes).
import { couleurRubrique, styleCouleur } from '../../ui/couleurs.ts';

export function styleTeinte(couleur: string, mode: 'nuit' | 'jour'): string {
  return `${styleCouleur(couleurRubrique(couleur, mode))};--c-titre:${mode === 'nuit' ? 'var(--c)' : 'var(--c-encre)'}`;
}
