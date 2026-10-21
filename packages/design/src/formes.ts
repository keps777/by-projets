/** Rayons, espacements et animation, relevés dans les planches de docs/maquettes-v3. */

/** Rayons du ticket AM-003 (en px). */
export const rayons = [12, 14, 16, 18, 22] as const;
/** Pastilles et puces. */
export const rayonPilule = 999;
/** Autres rayons très présents (10 : 232 occurrences, 6 : 113, 8 : 76, 20 : cartes de Systeme.dc.html). */
export const rayonsComplementaires = [6, 8, 10, 20] as const;

/** Écarts (gap et padding) en px relevés dans les planches. */
export const espaces = [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24] as const;
/** Marge latérale des écrans de 390 px (padding: 20px 16px 10px de Main.dc.html). */
export const gouttiere = 16;

export type Rayon = (typeof rayons)[number] | typeof rayonPilule;
export type Espace = (typeof espaces)[number];

/** Animation « pulse » : opacité 1 → .35 → 1 en 1,6 s, en boucle (état « en direct »). */
export const pulse = {
  nom: "pulse",
  duree: "1.6s",
  iteration: "infinite",
  opaciteMin: 0.35,
  keyframes: "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}",
  /** Valeur de la propriété CSS `animation`. */
  animation: "pulse 1.6s infinite",
} as const;
