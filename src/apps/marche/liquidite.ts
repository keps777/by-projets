// « Vendre ou attendre » : estimation du prix, du délai, de la certitude et du net selon le curseur de patience (rachat instantané, annonce au marché, attente). Fonctions pures.
// Hypothèses (maquette m2-04) : l'annonce se place au prix suggéré (≈ 82 % du neuf) ; attendre jusqu'à J-7 peut monter d'environ un sixième, avec une fourchette qui s'élargit et une vente moins certaine.
import { commission, delaiVenteEstime, net, prixSuggere } from '../../core/regles.ts';
import { prixRachat } from '../../domain/revente.ts';
import { jourCourt } from './format.ts';

const J = 86_400_000, ROND = (x: number) => Math.round(x / 10) * 10;
export type ModeVente = 'rachat' | 'annonce' | 'attente';
/** Positions du curseur : rachat jusqu'à 15, annonce de 16 à 70, attente au-delà. */
export const modeDe = (v: number): ModeVente => (v <= 15 ? 'rachat' : v > 70 ? 'attente' : 'annonce');
export const V_RACHAT = 0, V_ANNONCE = 50;

export interface Horizon { fin: number; jours: number; label: string }
/** Jusqu'où le curseur d'attente va : J-7 (départ − 7 jours) ; à moins d'une semaine du départ, jusqu'à l'échéance J-1. */
export function horizon(depart: number, echeance: number, maintenant: number): Horizon {
  const j7 = depart - 7 * J;
  if (j7 >= maintenant + 2 * J) return { fin: j7, jours: Math.round((j7 - maintenant) / J), label: 'J-7' };
  return { fin: echeance, jours: Math.max(2, Math.floor((echeance - maintenant) / J)), label: 'J-1' };
}
export interface Point { prix: number; demi: number; jours: number; cert: number }
/** Les trois points de référence de la courbe (curseur à 16, 50 et 100) pour un droit de ce prix équivalent neuf. */
export function pointsReference(prixNeuf: number, joursMax: number): [Point, Point, Point] {
  const s = Math.min(prixNeuf, prixSuggere(prixNeuf)), d50 = Math.min(delaiVenteEstime(s, prixNeuf), Math.max(1, joursMax - 1));
  return [{ prix: ROND(s * 0.92), demi: ROND(s * 0.0267), jours: 1, cert: 85 }, { prix: s, demi: ROND(s * 0.0533), jours: d50, cert: 70 }, { prix: Math.min(prixNeuf, ROND(s * 1.167)), demi: ROND(s * 0.1), jours: Math.max(joursMax, d50 + 1), cert: 35 }];
}
export interface Estimation { mode: ModeVente; prix: number; bas: number; haut: number; jours: number; cert: number; niveau: 1 | 2 | 3; mot: 'Élevée' | 'Moyenne' | 'Faible'; commission: number; net: number }
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Estimation pour une position du curseur (0–100). Le rachat est un montant net, ferme, sans commission ajoutée. */
export function estimation(v: number, prixNeuf: number, joursMax: number, pass: boolean): Estimation {
  const mode = modeDe(v);
  if (mode === 'rachat') { const p = prixRachat(prixNeuf); return { mode, prix: p, bas: p, haut: p, jours: 0, cert: 95, niveau: 3, mot: 'Élevée', commission: 0, net: p }; }
  const [a, b, c] = pointsReference(prixNeuf, joursMax), [p0, p1, t] = v <= 50 ? [a, b, (Math.max(16, v) - 16) / 34] : [b, c, (v - 50) / 50];
  const prix = Math.min(prixNeuf, ROND(mix(p0.prix, p1.prix, t))), demi = ROND(mix(p0.demi, p1.demi, t)), cert = mix(p0.cert, p1.cert, t), niveau = cert >= 80 ? 3 : cert >= 55 ? 2 : 1;
  const co = commission(prix, pass);
  return { mode, prix, bas: Math.max(0, prix - demi), haut: Math.min(prixNeuf, prix + demi), jours: Math.max(1, Math.round(mix(p0.jours, p1.jours, t))), cert, niveau, mot: niveau === 3 ? 'Élevée' : niveau === 2 ? 'Moyenne' : 'Faible', commission: co, net: net(prix, pass) };
}
/** Date estimée de la vente, « 18 oct. ». */
export const dateVente = (jours: number, maintenant: number): string => jourCourt(maintenant + jours * J);

export interface Courbe { rachat: [number, number, number]; annonce: [number, number][]; bande: string; points: [number, number][]; grille: { texte: number; y: number }[]; yPlafond: number; xRachat: number; xAnnonce: number; xAttente: number }
/** Position verticale (0 = haut du tracé de 150 px) d'un prix : le plafond (prix neuf) est à 22, 60 % du neuf en bas. */
export const yPrix = (prix: number, prixNeuf: number): number => 150 - ((prix - 0.6 * prixNeuf) * 320) / prixNeuf;
export const xCurseur = (v: number): number => 44 + 2.6 * v;
/** Géométrie du graphique de la maquette (316 × 150), pour n'importe quel prix neuf. */
export function courbe(prixNeuf: number, joursMax: number): Courbe {
  const [a, b, c] = pointsReference(prixNeuf, joursMax), y = (p: number) => yPrix(p, prixNeuf), r = prixRachat(prixNeuf), f = (n: number) => +n.toFixed(1);
  const haut = (p: Point) => Math.min(prixNeuf, p.prix + p.demi), bas = (p: Point) => Math.max(0, p.prix - p.demi);
  const bande = [[xCurseur(16), haut(a)], [xCurseur(50), haut(b)], [xCurseur(100), haut(c)], [xCurseur(100), bas(c)], [xCurseur(50), bas(b)], [xCurseur(16), bas(a)]].map(([x, p]) => `${f(x!)},${f(y(p!))}`).join(' ');
  return { rachat: [xCurseur(0), xCurseur(15), f(y(r))], annonce: [[xCurseur(16), y(a.prix)], [xCurseur(50), y(b.prix)], [xCurseur(100), y(c.prix)]].map(([x, yy]) => [f(x!), f(yy!)] as [number, number]), bande,
    points: [[f(xCurseur(7.5)), f(y(r))], [xCurseur(50), f(y(b.prix))], [xCurseur(100), f(y(c.prix))]] as [number, number][], grille: [0.95, 0.85, 0.75, 0.65].map((k) => ({ texte: Math.round((prixNeuf * k) / 100) * 100, y: f(y(prixNeuf * k)) })), yPlafond: f(y(prixNeuf)), xRachat: 64, xAnnonce: 155, xAttente: 266 };
}
