// Les trois promesses du carrousel (ordre = ordre des diapositives) et leurs petites règles.
export interface Promesse { id: 'voyager' | 'revendre' | 'nommer'; kicker: string; titre: string; texte: string; /** Libellé court pour les points de pagination. */ nom: string }
export const PROMESSES: Promesse[] = [
  { id: 'voyager', nom: 'Voyager', kicker: '1 / 3 · Voyager', titre: 'Trouvez un vol, neuf ou en revente', texte: 'Les billets des compagnies et ceux que d’autres voyageurs revendent, au même endroit.' },
  { id: 'revendre', nom: 'Revendre', kicker: '2 / 3 · Revendre', titre: 'Revendre si vos plans changent', texte: 'Votre billet n’est pas perdu. Mettez-le en vente à un prix encadré ; le montant obtenu dépend des acheteurs.' },
  { id: 'nommer', nom: 'Nommer le voyageur', kicker: '3 / 3 · Nommer', titre: 'Nommez le voyageur à la fin', texte: 'Vous ou un proche : le nom est transmis à la compagnie avant l’échéance (la veille du départ, à confirmer).' }
];
export const NB = PROMESSES.length;
/** Borne un indice de diapositive. */
export const borner = (i: number): number => Math.max(0, Math.min(NB - 1, Math.round(i)));
/** Diapositive atteinte par une touche (flèches, Début, Fin) ; `null` si la touche ne concerne pas le carrousel. */
export function apresTouche(touche: string, courant: number): number | null {
  switch (touche) {
    case 'ArrowRight': case 'ArrowDown': return borner(courant + 1);
    case 'ArrowLeft': case 'ArrowUp': return borner(courant - 1);
    case 'Home': return 0;
    case 'End': return NB - 1;
    default: return null;
  }
}
/** Diapositive visible d'après la position de défilement (largeur d'une diapositive = largeur de la piste). */
export const indexDepuisDefilement = (gauche: number, largeur: number): number => (largeur > 0 ? borner(gauche / largeur) : 0);
/** Annonce vocale du changement de diapositive. */
export const annonce = (i: number): string => `Diapositive ${i + 1} sur ${NB} : ${PROMESSES[borner(i)].nom}`;
export const libellePoint = (i: number): string => `Page ${i + 1} sur ${NB} : ${PROMESSES[i].nom}`;
const deux = (n: number) => String(n).padStart(2, '0');
/** 86382 s → « 23:59:42 ». */
export function compteARebours(secondes: number): string { const s = Math.max(0, Math.floor(secondes)); return `${deux(Math.floor(s / 3600))}:${deux(Math.floor((s % 3600) / 60))}:${deux(s % 60)}`; }
/** Décompte de démonstration : repart à 23:59:59 à zéro. */
export const decompteSuivant = (s: number): number => (s - 1 > 0 ? s - 1 : 86399);
