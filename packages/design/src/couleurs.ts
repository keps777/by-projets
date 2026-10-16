/**
 * Couleurs du système graphique v3, relevées dans docs/maquettes-v3/Systeme.dc.html
 * (planche « Couleurs · inchangées depuis la v2 ») et dans les autres planches.
 */

/** Les couleurs de la planche Système (le Gris n'y figure que dans la pastille de siège « pris »). */
export const couleurs = {
  nuit: "#0B1019",
  surface: "#141B28",
  surface2: "#1B2435",
  trait: "#273247",
  craie: "#F4F0E8",
  craie2: "#B5BDCB",
  gris: "#7F8A9E",
  orange: "#FF6A1F",
  ambre: "#FFB547",
  vert: "#43E39B",
  rouge: "#FF5C5C",
  bleu: "#6FA8FF",
  profond: "#050810",
} as const;

/** Fonds et bords des états, relevés dans les puces et bandeaux des planches. */
export const teintesEtat = {
  /** Fond vert (puce « Payé », bulle de l'assistant). */
  vertFond: "#0E2A1E",
  /** Bord vert (puce « Payé », bulle de l'assistant). */
  vertBord: "#1E5A40",
  /** Fond rouge (puce « INOPINÉ »). */
  rougeFond: "#2A0F0F",
  /** Fond ambre (bandeaux d'attente), bord Ambre. */
  ambreFond: "#2A1F0B",
  /** Fond bleu (bandeaux d'information), bord Bleu. */
  bleuFond: "#0F1A2E",
} as const;

/** Autres valeurs récurrentes des planches, hors liste du ticket. */
export const complements = {
  /** Fond de carte plus sombre que Surface (86 occurrences). */
  carteSombre: "#0F1521",
  /** Bord des cases actives, par exemple le siège « libre » de Systeme.dc.html. */
  traitFort: "#3A4760",
  /** Texte le plus discret (mentions du billet et de l'étiquette colis). */
  grisSourd: "#4A5468",
} as const;

export type CouleurNom = keyof typeof couleurs;
export type TeinteEtatNom = keyof typeof teintesEtat;
export type ComplementNom = keyof typeof complements;
