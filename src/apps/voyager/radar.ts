// Radar des destinations : placement polaire (cap = direction, durée de vol = distance), offres de chaque destination, filtres de budget et de type.
// Fonctions pures : le monde et l'instant sont des paramètres.
import { departDe, peutEchanger } from '../../core/regles.ts';
import type { Aeroport, Monde } from '../../domain/types.ts';
import { dureeHeures } from './format.ts';

/** Le radar se dessine dans un carré de 350 px dont le centre est Montréal. */
export const TAILLE = 350;
export const CENTRE = TAILLE / 2;
/** Anneaux : durée de vol (h) → rayon (px). Chaque cercle ajoute 3 heures ; les rayons s'écartent moins vers l'extérieur pour que « 12 h+ » tienne dans le carré. */
export const ANNEAUX: { h: number; rayon: number; etiquette: string }[] = [{ h: 3, rayon: 50, etiquette: '3 h' }, { h: 6, rayon: 100, etiquette: '6 h' }, { h: 9, rayon: 130, etiquette: '9 h' }, { h: 12, rayon: 160, etiquette: '12 h+' }];
const RAYON_PLAFOND = 156;
export const BUDGET_MIN = 200, BUDGET_MAX = 2500, BUDGET_PAS = 50, BUDGET_DEFAUT = 1200;

/** Rayon (px) d'une durée de vol : interpolation linéaire entre les anneaux, plafonnée au bord du cercle « 12 h+ ». */
export function rayonPourDuree(h: number): number {
  if (h <= 0) return 0;
  let h0 = 0, r0 = 0;
  for (const a of ANNEAUX) { if (h <= a.h) return r0 + ((h - h0) / (a.h - h0)) * (a.rayon - r0); h0 = a.h; r0 = a.rayon; }
  return Math.min(RAYON_PLAFOND, ANNEAUX.at(-1)!.rayon - 4);
}
export interface Point { x: number; y: number }
/** Position dans le carré du radar : cap en degrés (0 = nord, 90 = est), durée en heures. */
export function positionPolaire(cap: number, dureeH: number, centre = CENTRE): Point {
  const a = (cap * Math.PI) / 180, r = rayonPourDuree(dureeH);
  return { x: centre + r * Math.sin(a), y: centre - r * Math.cos(a) };
}
/** Écarte les points trop proches (itérations de répulsion, résultat déterministe), sans les sortir du disque ni les approcher du centre. */
export function ecarter(points: Point[], distanceMin = 36, marge = 18, iterations = 60): Point[] {
  const p = points.map((q) => ({ ...q }));
  for (let it = 0; it < iterations; it++) {
    let bouge = false;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
      let dx = p[j].x - p[i].x, dy = p[j].y - p[i].y, d = Math.hypot(dx, dy);
      if (d >= distanceMin) continue;
      if (d < 0.01) { dx = 1; dy = 0; d = 1; }
      const pousse = (distanceMin - d) / 2 + 0.25, ux = dx / d, uy = dy / d;
      p[i].x -= ux * pousse; p[i].y -= uy * pousse; p[j].x += ux * pousse; p[j].y += uy * pousse; bouge = true;
    }
    for (const q of p) { // reste dans le disque (rayon utile) et hors de la pastille YUL
      let dx = q.x - CENTRE, dy = q.y - CENTRE; const r0 = Math.hypot(dx, dy); if (r0 < 0.01) dx = 1; const r = r0 < 0.01 ? 1 : r0, lim = ANNEAUX.at(-1)!.rayon - marge / 2, mini = 34;
      const cible = Math.min(lim, Math.max(mini, r)); if (cible !== r) { q.x = CENTRE + (dx / r) * cible; q.y = CENTRE + (dy / r) * cible; }
    }
    if (!bouge) break;
  }
  return p;
}
const POINTS_CARDINAUX = ['Nord', 'Nord-nord-est', 'Nord-est', 'Est-nord-est', 'Est', 'Est-sud-est', 'Sud-est', 'Sud-sud-est', 'Sud', 'Sud-sud-ouest', 'Sud-ouest', 'Ouest-sud-ouest', 'Ouest', 'Ouest-nord-ouest', 'Nord-ouest', 'Nord-nord-ouest'];
/** « Nord-est » : la direction en toutes lettres (16 points de la rose des vents). */
export const direction = (cap: number): string => POINTS_CARDINAUX[Math.round((((cap % 360) + 360) % 360) / 22.5) % 16];
export type Cote = 'D' | 'G' | 'H' | 'B';
/** Côté préféré de l'étiquette : à droite ou à gauche selon la moitié du radar, au-dessus près de l'axe nord. */
export const coteVoulu = (p: Point): Cote => (Math.abs(p.x - CENTRE) < 18 && p.y < CENTRE ? 'H' : p.x >= CENTRE ? 'D' : 'G');
const ETQ_L = 84, ETQ_H = 34, DECALAGE = 14, DEMI_POINT = 14;
interface Rect { x0: number; y0: number; x1: number; y1: number }
const rectEtiquette = (px: number, py: number, c: Cote): Rect => c === 'D' ? { x0: px + DECALAGE, y0: py - ETQ_H / 2, x1: px + DECALAGE + ETQ_L, y1: py + ETQ_H / 2 } : c === 'G' ? { x0: px - DECALAGE - ETQ_L, y0: py - ETQ_H / 2, x1: px - DECALAGE, y1: py + ETQ_H / 2 }
  : c === 'H' ? { x0: px - ETQ_L / 2, y0: py - DECALAGE - ETQ_H, x1: px + ETQ_L / 2, y1: py - DECALAGE } : { x0: px - ETQ_L / 2, y0: py + DECALAGE, x1: px + ETQ_L / 2, y1: py + DECALAGE + ETQ_H };
const croise = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const carre = (x: number, y: number, demi: number): Rect => ({ x0: x - demi, y0: y - demi, x1: x + demi, y1: y + demi });
/** Choisit pour chaque destination le côté de son étiquette (droite, gauche, dessus, dessous) : le premier côté qui ne recouvre ni une autre étiquette, ni un autre point, ni la pastille YUL, et qui reste dans la page.
 *  `largeur` : largeur réelle du radar en px (les points, calculés sur 350 px, sont mis à l'échelle) ; la page offre 20 px de marge de chaque côté. */
export function placerEtiquettes(points: Point[], largeur = TAILLE, marge = 20): Cote[] {
  const k = largeur / TAILLE, pos = points.map((p) => ({ x: p.x * k, y: p.y * k }));
  const obstacles: Rect[] = [carre((CENTRE * largeur) / TAILLE, (CENTRE * largeur) / TAILLE, 21), ...pos.map((p) => carre(p.x, p.y, DEMI_POINT))];
  const choix: Cote[] = points.map((p) => coteVoulu(p)), poses: (Rect | null)[] = points.map(() => null);
  const ordre = points.map((_, i) => i).sort((a, b) => pos[a].y - pos[b].y || pos[a].x - pos[b].x);
  for (const i of ordre) {
    const voulu = coteVoulu(points[i]), autre: Cote = voulu === 'G' ? 'D' : 'G', candidats: Cote[] = [voulu, autre, 'H', 'B'];
    const dansLaPage = (c: Cote) => { const r = rectEtiquette(pos[i].x, pos[i].y, c); return r.x0 >= -marge && r.x1 <= largeur + marge; };
    const libre = candidats.find((c) => {
      if (!dansLaPage(c)) return false;
      const r = rectEtiquette(pos[i].x, pos[i].y, c);
      if (poses.some((q, j) => j !== i && q && croise(r, q))) return false;
      return !obstacles.some((o, j) => (j === 0 || j - 1 !== i) && croise(r, o));
    });
    choix[i] = libre ?? candidats.find(dansLaPage) ?? voulu; poses[i] = rectEtiquette(pos[i].x, pos[i].y, choix[i]);
  }
  return choix;
}

export type TypeOffre = 'neuf' | 'revente' | 'drop';
/** Le radar propose « Neuf » (neuf et agences), « Revente » et « Drops ». */
export interface OffreRadar { type: TypeOffre; /** « Agence » pour une offre d'agence rangée sous « Neuf ». */ etiquette: 'Neuf' | 'Revente' | 'Drop membres' | 'Agence'; prix: number; volId: string; jour: string; /** 0 à 1 : écart au prix équivalent neuf du même vol. */ aubaine: number }
export interface Destination { code: string; ville: string; pays: string; dureeH: number; cap: number; x: number; y: number; offres: OffreRadar[] }
export const ETIQUETTES: Record<TypeOffre, string> = { neuf: 'Neuf', revente: 'Revente', drop: 'Drop membres' };

const aubaineDe = (prix: number, prixNeuf: number) => Math.min(1, Math.max(0, 1 - prix / prixNeuf));
/** Les destinations du radar (tous les aéroports sauf Montréal et Los Angeles), avec leurs offres encore ouvertes à `now`. `compteId` : ses propres annonces ne sont pas proposées à l'achat. */
export function destinationsRadar(monde: Monde, now: number, compteId?: string | null): Destination[] {
  const aeroports: Aeroport[] = monde.aeroports.filter((a) => a.code !== 'YUL' && a.code !== 'LAX');
  const base = aeroports.map((a) => positionPolaire(a.cap, a.dureeH)), pos = ecarter(base);
  return aeroports.map((a, i) => {
    const offres: OffreRadar[] = [];
    for (const v of monde.vols) {
      if (v.vers !== a.code || !peutEchanger(departDe(v.jour, v.heureDepart), now)) continue;
      offres.push({ type: 'neuf', etiquette: 'Neuf', prix: v.prixNeuf, volId: v.id, jour: v.jour, aubaine: 0 });
      for (const d of monde.droits) if (d.volId === v.id && d.statut === 'en_vente' && d.annonce && d.detenteurId !== compteId) offres.push({ type: 'revente', etiquette: 'Revente', prix: d.annonce.prix, volId: v.id, jour: v.jour, aubaine: aubaineDe(d.annonce.prix, v.prixNeuf) });
      for (const o of monde.offresAgence) if (o.volId === v.id) offres.push({ type: 'neuf', etiquette: 'Agence', prix: o.prix, volId: v.id, jour: v.jour, aubaine: aubaineDe(o.prix, v.prixNeuf) });
      for (const dr of monde.drops) if (dr.volId === v.id && dr.restantes > 0 && now < dr.fin) offres.push({ type: 'drop', etiquette: 'Drop membres', prix: dr.prixMembre, volId: v.id, jour: v.jour, aubaine: aubaineDe(dr.prixMembre, v.prixNeuf) });
    }
    return { code: a.code, ville: a.ville, pays: a.pays, dureeH: a.dureeH, cap: a.cap, x: pos[i].x, y: pos[i].y, offres };
  });
}

export interface Filtres { budget: number; neuf: boolean; revente: boolean; drop: boolean }
export const FILTRES_DEFAUT: Filtres = { budget: BUDGET_DEFAUT, neuf: true, revente: true, drop: false };
export interface Evaluation { dest: Destination; meilleure: OffreRadar | null; /** Sous le budget max avec les types retenus. */ dans: boolean; /** Diamètre du point (px) : plus l'aubaine est forte, plus il est gros. */ taille: number; estDrop: boolean; prixTexte: string }
const fmtPrix = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} $`;
/** Meilleure offre d'une destination selon les types retenus, et rang par rapport au budget. */
export function evaluer(dest: Destination, f: Filtres): Evaluation {
  const retenues = dest.offres.filter((o) => f[o.type]).sort((a, b) => a.prix - b.prix || b.aubaine - a.aubaine);
  const meilleure = retenues[0] ?? null;
  const dans = !!meilleure && meilleure.prix <= f.budget;
  const taille = meilleure ? Math.min(26, Math.max(12, Math.round(12 + meilleure.aubaine * 60))) : 10;
  return { dest, meilleure, dans, taille, estDrop: meilleure?.type === 'drop', prixTexte: meilleure ? `dès ${fmtPrix(meilleure.prix)}` : 'aucune offre' };
}
/** Destinations dans le budget, de la moins chère à la plus chère (la liste accessible, alternative au radar). */
export const dansLeBudget = (evals: Evaluation[]): Evaluation[] => evals.filter((e) => e.dans).sort((a, b) => a.meilleure!.prix - b.meilleure!.prix || a.dest.ville.localeCompare(b.dest.ville, 'fr'));
/** « 6 h 30 · Revente » : sous-titre d'une ligne de la liste. */
export const sousTitre = (e: Evaluation): string => `${dureeHeures(e.dest.dureeH)} · ${e.meilleure?.etiquette ?? 'Aucune offre'}`;
export const aucunType = (f: Filtres): boolean => !f.neuf && !f.revente && !f.drop;
/** Phrase de la liste vide. */
export const messageVide = (f: Filtres): string => (aucunType(f) ? 'Aucun type d’offre sélectionné. Activez Neuf, Revente ou Drops.' : `Aucune destination sous ${fmtPrix(f.budget)} avec ces filtres. Augmentez le budget max ou ajoutez la revente.`);
/** Lien vers les résultats : le jour du vol de la meilleure offre (ou du premier vol connu). */
export function lienResultats(e: Evaluation): string { const o = e.meilleure ?? e.dest.offres[0]; return `/resultats?de=YUL&vers=${e.dest.code}${o ? `&jour=${o.jour}` : ''}`; }
export const texteBudget = fmtPrix;
