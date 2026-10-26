// Écran large (PC, ≥ 900 px) : même seuil que les `@media (min-width: 900px)` des composants. Sert quand la variante PC change la structure
// du composant (un autre découpage, pas seulement un autre style) ; le mobile garde alors exactement son balisage d'origine.
const REQUETE = '(min-width: 900px)';
const lire = (): boolean => typeof matchMedia === 'function' && matchMedia(REQUETE).matches;
export const largeur = $state({ pc: lire() });
if (typeof matchMedia === 'function') matchMedia(REQUETE).addEventListener('change', (e) => (largeur.pc = e.matches));
