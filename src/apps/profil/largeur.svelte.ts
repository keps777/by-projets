// Largeur de l'écran : vrai à partir de 900 px (variante PC). Sert aux écrans dont le contenu change de place, pas seulement de style
// (boutons d'action déplacés du pied de page vers la colonne, textes propres au PC) ; le reste passe par `@media (min-width: 900px)`.
const requete = typeof matchMedia === 'function' ? matchMedia('(min-width: 900px)') : null;
export const largeur = $state({ pc: !!requete?.matches });
requete?.addEventListener('change', (e) => (largeur.pc = e.matches));
