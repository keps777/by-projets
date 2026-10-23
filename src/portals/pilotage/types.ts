export interface Barre { libelle: string; valeur: number; couleur: string; /** Texte lu par les lecteurs d'écran pour cette barre. */ aria: string; /** Valeur formatée (tableau alternatif). */ texte: string }
export interface Serie { nom: string; valeurs: number[]; couleur: string; tirets?: string }
export interface LigneH { libelle: string; valeur: number; texte: string; couleur: string; note?: string }
