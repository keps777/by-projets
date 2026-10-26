// Le panneau qui tourne : un caractère à palettes affiche des lettres au hasard (pseudo-aléatoires, déterministes) puis se pose sur sa cible.
export const RESERVE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** Nombre de pas de l'animation (un pas = 55 ms, comme la maquette). */
export const PAS_TOTAL = 32;
export const PAS_MS = 55;
export interface Cellule { ch: string; pose: boolean }
/** Caractère affiché au pas `pas` : la cible dès `poseA`, avant cela une lettre de la réserve. `pas >= PAS_TOTAL` ou mouvement réduit : toujours la cible. */
export function cellule(cible: string, graine: number, poseA: number, pas: number): Cellule {
  const pose = pas >= poseA;
  return { ch: pose ? cible : RESERVE.charAt(((pas * 7 + graine * 11 + 3) % RESERVE.length + RESERVE.length) % RESERVE.length), pose };
}
export const MARQUE = 'NEXG·TT';
export interface Depart { heure: string; code: string; ville: string; statut: string; teinte: 'ok' | 'info' | 'signal'; pulse: boolean }
export const DEPARTS: Depart[] = [
  { heure: '18:05', code: 'CDG', ville: 'Paris', statut: 'À l’heure', teinte: 'ok', pulse: false },
  { heure: '19:30', code: 'PUJ', ville: 'Punta Cana', statut: 'Revente', teinte: 'info', pulse: false },
  { heure: '21:15', code: 'LIS', ville: 'Lisbonne', statut: 'Embarq.', teinte: 'signal', pulse: true }
];
/** Pas auquel la cellule `j` de la ligne `ri` se pose (la marque : 10 + 3 × rang). */
export const poseMarque = (i: number): number => 10 + i * 3;
export const poseLigne = (ri: number, j: number): number => 6 + ri * 4 + j * 2;
/** Texte alternatif du tableau. */
export const ALT_TABLEAU = 'Tableau des départs qui s’arrête sur NEXG·TT, Next Generation Travel Ticket';
