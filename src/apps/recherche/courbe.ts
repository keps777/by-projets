// Courbe « Prix équivalent » d'un vol : points du graphique SVG, étiquettes de l'axe, variation signée et alternative textuelle.
// `Vol.courbe` : un point par jour sur les 90 derniers jours, le dernier étant le prix d'aujourd'hui.
import { dollars } from './montants.ts';
import { ajouterJours, moisCourt, moisLong } from './dates.ts';

/** Cadre du graphique (maquette) : 312 × 96, l'axe à 94, la courbe entre 6,2 (le plus haut) et 89,8 (le plus bas). */
export const LARGEUR = 312, HAUTEUR = 96, AXE = 94, BAS = 89.8, HAUT = 6.2;
export interface CourbeGraphique {
  /** Points `x,y` de la polyligne, prêts pour `points="…"`. */ points: string; /** Position verticale du prix demandé (ligne pointillée), ou `null` s'il n'y en a pas. */ yPrix: number | null;
  /** Position du dernier point (pastille bleue). */ fin: { x: number; y: number }; min: number; max: number;
}
/** Convertit la courbe en coordonnées SVG (axe vertical inversé) ; l'échelle englobe aussi le prix demandé pour qu'il reste dans le cadre. */
export function pointsDeCourbe(courbe: number[], prixDemande?: number): CourbeGraphique {
  const n = courbe.length; if (!n) return { points: '', yPrix: null, fin: { x: LARGEUR, y: BAS }, min: 0, max: 0 };
  const bornes = prixDemande !== undefined ? [...courbe, prixDemande] : courbe, min = Math.min(...bornes), max = Math.max(...bornes), etendue = max - min || 1;
  const y = (v: number) => Math.round((BAS - ((v - min) / etendue) * (BAS - HAUT)) * 10) / 10, x = (i: number) => Math.round((n === 1 ? LARGEUR / 2 : 2 + (i * (LARGEUR - 4)) / (n - 1)) * 10) / 10;
  return { points: courbe.map((v, i) => `${x(i)},${y(v)}`).join(' '), yPrix: prixDemande !== undefined ? y(prixDemande) : null, fin: { x: x(n - 1), y: y(courbe[n - 1]) }, min, max };
}
/** Variation entre le premier et le dernier point : toujours signée (▲ / ▼ / ■), jamais la couleur seule. */
export function variation(courbe: number[]): { abs: number; sens: 'hausse' | 'baisse' | 'stable'; texte: string } {
  if (courbe.length < 2) return { abs: 0, sens: 'stable', texte: '0 $' };
  const abs = Math.round((courbe[courbe.length - 1] - courbe[0]) * 100) / 100, sens = abs > 0 ? 'hausse' : abs < 0 ? 'baisse' : 'stable';
  return { abs, sens, texte: `${abs > 0 ? '+' : ''}${dollars(abs)}` };
}
/** Étiquettes de l'axe : le mois du premier point avec son prix (« juil. · 1 845 $ »), deux mois intermédiaires, puis « auj. ». */
export function etiquettesAxe(courbe: number[], aujourdhui: string): string[] {
  const n = courbe.length; if (!n) return [];
  const debut = ajouterJours(aujourdhui, -(n - 1)), jourDe = (i: number) => ajouterJours(debut, i);
  return [`${moisCourt(debut)} · ${dollars(courbe[0])}`, moisCourt(jourDe(Math.round((n - 1) / 3))), moisCourt(jourDe(Math.round(((n - 1) * 2) / 3))), 'auj.'];
}
/** Mois du premier point (« juillet ») : le graphique dit « depuis juillet » parce que la courbe couvre les 90 derniers jours. */
export const depuisMois = (nbPoints: number, aujourdhui: string): string => moisLong(ajouterJours(aujourdhui, -(Math.max(1, nbPoints) - 1)));
export const depuisMoisCourt = (nbPoints: number, aujourdhui: string): string => moisCourt(ajouterJours(aujourdhui, -(Math.max(1, nbPoints) - 1)));
/** Lignes de la table alternative (une valeur environ toutes les deux semaines, plus le dernier jour) : « il y a 84 jours » → prix. */
export function lignesTable(courbe: number[], aujourdhui: string, pas = 14): { jour: string; prix: number }[] {
  const n = courbe.length, debut = ajouterJours(aujourdhui, -(n - 1)), idx: number[] = [];
  for (let i = 0; i < n - 1; i += pas) idx.push(i); if (n) idx.push(n - 1);
  return idx.map((i) => ({ jour: ajouterJours(debut, i), prix: courbe[i] }));
}
/** Phrase qui décrit le graphique pour un lecteur d'écran. */
export function resumeCourbe(courbe: number[], prixDemande: number | undefined, aujourdhui: string): string {
  if (!courbe.length) return 'Aucune donnée de prix.';
  const v = variation(courbe), mn = Math.min(...courbe), mx = Math.max(...courbe);
  return `Prix équivalent neuf depuis ${depuisMois(courbe.length, aujourdhui)} : de ${dollars(courbe[0])} à ${dollars(courbe[courbe.length - 1])} aujourd’hui (${v.texte}), entre ${dollars(mn)} et ${dollars(mx)}.${prixDemande !== undefined ? ` Prix demandé : ${dollars(prixDemande)}.` : ''}`;
}
