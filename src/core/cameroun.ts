// Carte du Cameroun en relief : contour simplifié (écrit à la main, lon/lat), villes phares, projection en perspective et arcs « pont ». Pur, testé.
export type LonLat = readonly [number, number];
export interface Plan { x: number; y: number }
export interface P3 { x: number; y: number; z: number }
export interface Pt { x: number; y: number }

/** Frontières du pays, dans le sens trigonométrique depuis la presqu'île de Bakassi : côte du golfe de Guinée, Guinée équatoriale, Gabon, Congo, Centrafrique, Tchad, lac Tchad, Nigeria. Polygone simple, non refermé. */
export const CONTOUR: LonLat[] = [
  [8.50, 4.62], [8.50, 4.40], [8.80, 4.30], [9.00, 4.10], [9.20, 3.97], [9.45, 3.93], [9.58, 3.82], [9.60, 3.55], [9.70, 3.28], [9.88, 2.95], [9.90, 2.72], [9.80, 2.33],
  [10.35, 2.52], [11.00, 2.35], [11.34, 2.17], [13.29, 2.16], [14.10, 2.27], [15.00, 2.05], [15.60, 1.95], [16.05, 1.68], [16.20, 2.25], [16.10, 2.85], [15.70, 3.50], [15.30, 3.90], [14.80, 4.35],
  [14.60, 5.00], [14.55, 5.90], [14.75, 6.55], [15.10, 7.20], [15.50, 7.70], [15.20, 8.40], [14.65, 9.00], [14.15, 9.60], [14.55, 10.00], [15.05, 10.15], [15.35, 10.50], [15.20, 11.10], [15.03, 12.08],
  [14.75, 12.40], [14.55, 12.75], [14.20, 13.08], [13.80, 12.95], [13.70, 12.30], [13.55, 11.45], [13.55, 10.75], [13.50, 10.30], [13.25, 9.80], [13.00, 9.20], [12.80, 8.65], [12.35, 8.30],
  [12.10, 7.85], [11.85, 7.35], [11.55, 6.85], [11.25, 6.55], [10.85, 6.60], [10.45, 6.80], [10.05, 6.60], [9.60, 6.30], [9.25, 6.10], [8.95, 5.75], [8.80, 5.35], [8.62, 4.95]
];
/** Étendue du pays. */
export const BORNES = { lonMin: 8.5, lonMax: 16.2, latMin: 1.65, latMax: 13.08 };

export type Cote = 'g' | 'd' | 'h' | 'b';
/** Côtés possibles d'une étiquette placée automatiquement : les quatre côtés et les quatre coins (haut-gauche…). */
export type Cote8 = Cote | 'hg' | 'hd' | 'bg' | 'bd';
export interface VilleCarte { nom: string; lon: number; lat: number; /** Côté du point où s'écrit l'étiquette. */ cote: Cote }
/** Villes phares (les cinq gares du réseau, puis les autres grandes villes). Les coordonnées sont celles du centre-ville, ramenées de quelques minutes si besoin pour rester dans le contour simplifié. */
export const VILLES_CARTE: VilleCarte[] = [
  { nom: 'Yaoundé', lon: 11.52, lat: 3.87, cote: 'd' }, { nom: 'Douala', lon: 9.72, lat: 4.04, cote: 'b' }, { nom: 'Bafoussam', lon: 10.42, lat: 5.48, cote: 'd' },
  { nom: 'Bamenda', lon: 10.16, lat: 5.96, cote: 'g' }, { nom: 'Kribi', lon: 9.92, lat: 2.96, cote: 'g' }, { nom: 'Garoua', lon: 13.40, lat: 9.30, cote: 'd' },
  { nom: 'Maroua', lon: 14.32, lat: 10.59, cote: 'g' }, { nom: 'Ngaoundéré', lon: 13.58, lat: 7.32, cote: 'd' }, { nom: 'Bertoua', lon: 13.68, lat: 4.58, cote: 'd' },
  { nom: 'Ebolowa', lon: 11.15, lat: 2.90, cote: 'b' }, { nom: 'Limbé', lon: 9.25, lat: 4.04, cote: 'g' }, { nom: 'Buéa', lon: 9.26, lat: 4.19, cote: 'g' },
  { nom: 'Edéa', lon: 10.13, lat: 3.80, cote: 'd' }, { nom: 'Kumba', lon: 9.45, lat: 4.64, cote: 'g' }
];
export const villeCarte = (nom: string): VilleCarte | undefined => VILLES_CARTE.find((v) => v.nom === nom);

// ---- lon/lat → plan (en degrés, centré sur le pays, nord vers +y)
const LON0 = 12.35, LAT0 = 7.4, COS = Math.cos((LAT0 * Math.PI) / 180);
export const plan = (lon: number, lat: number): Plan => ({ x: (lon - LON0) * COS, y: lat - LAT0 });
export const planDe = (p: LonLat): Plan => plan(p[0], p[1]);
/** Épaisseur du relief (degrés) et marge de la dalle autour du pays. */
export const HAUTEUR = 0.45, MARGE = 0.35;
/** Les quatre coins de la dalle de verre sous le pays (sens horaire, nord-ouest en premier). */
export const dalle = (): Plan[] => {
  const a = plan(BORNES.lonMin - MARGE, BORNES.latMax + MARGE), b = plan(BORNES.lonMax + MARGE, BORNES.latMax + MARGE), c = plan(BORNES.lonMax + MARGE, BORNES.latMin - MARGE), d = plan(BORNES.lonMin - MARGE, BORNES.latMin - MARGE);
  return [a, b, c, d];
};

// ---- vue en perspective : lacet (rotation autour de la verticale), inclinaison (0 = vue du dessus, 90 = à l'horizon)
export interface Vue { lacet: number; inclinaison: number; echelle: number; cx: number; cy: number; /** Distance de la caméra (en degrés de plan). */ distance: number }
export const VUE_REPOS: Vue = { lacet: 0, inclinaison: 54, echelle: 1, cx: 0, cy: 0, distance: 60 };
const rad = (d: number) => (d * Math.PI) / 180;
/** Projette un point du plan (x vers l'est, y vers le nord, z vers le haut) à l'écran ; `k` est le grossissement de perspective (plus grand = plus près). */
export function projeter(p: P3, v: Vue): Pt & { k: number } {
  const c = Math.cos(rad(v.lacet)), s = Math.sin(rad(v.lacet)), u = p.x * c - p.y * s, w = p.x * s + p.y * c;
  const ci = Math.cos(rad(v.inclinaison)), si = Math.sin(rad(v.inclinaison));
  const k = v.distance / (v.distance + w * si - p.z * ci);
  return { x: v.cx + u * k * v.echelle, y: v.cy - (w * ci + p.z * si) * k * v.echelle, k };
}
export const projeterPlan = (p: Plan, z: number, v: Vue): Pt & { k: number } => projeter({ x: p.x, y: p.y, z }, v);
export const projeterLL = (p: LonLat, z: number, v: Vue): Pt & { k: number } => projeterPlan(planDe(p), z, v);

/** Échelle et centre pour que les points tiennent dans `largeur × hauteur` (marge `marge`), avec le réglage de `base` (échelle et centre ignorés). */
export function ajuster(base: Vue, pts: P3[], largeur: number, hauteur: number, marge: number): Vue {
  const ps = pts.map((p) => projeter(p, { ...base, echelle: 1, cx: 0, cy: 0 }));
  const x0 = Math.min(...ps.map((p) => p.x)), x1 = Math.max(...ps.map((p) => p.x)), y0 = Math.min(...ps.map((p) => p.y)), y1 = Math.max(...ps.map((p) => p.y));
  const echelle = Math.min((largeur - 2 * marge) / (x1 - x0), (hauteur - 2 * marge) / (y1 - y0));
  return { ...base, echelle, cx: largeur / 2 - echelle * ((x0 + x1) / 2), cy: hauteur / 2 - echelle * ((y0 + y1) / 2) };
}
/** Points du contour projetés à l'altitude `z`. */
export const contourProjete = (z: number, v: Vue): Pt[] => CONTOUR.map((p) => projeterLL(p, z, v));
/** « M x y L … Z » (arrondi au dixième de pixel). */
export function chemin(pts: Pt[], ferme = true): string {
  const f = (n: number) => Math.round(n * 10) / 10;
  return pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join('') + (ferme ? 'Z' : '');
}

// ---- arc « pont » entre deux villes
/** Hauteur de l'arc (degrés) selon la distance : un pont bas pour deux villes proches, plus haut pour les longues liaisons. */
export const hauteurArc = (distance: number) => Math.min(2, Math.max(0.35, 0.55 * distance));
/** Distance entre deux villes dans le plan (degrés). */
export const distancePlan = (a: LonLat, b: LonLat) => { const p = planDe(a), q = planDe(b); return Math.hypot(p.x - q.x, p.y - q.y); };
/** Points 3D d'un arc partant de `a`, arrivant en `b`, qui s'élève au-dessus du relief (altitude de base `z0`). */
export function arc3D(a: LonLat, b: LonLat, n = 40, z0 = HAUTEUR): P3[] {
  const p = planDe(a), q = planDe(b), h = hauteurArc(distancePlan(a, b));
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: z0 + h * Math.sin(Math.PI * t) }; });
}
/** Arc projeté à l'écran. */
export const arcProjete = (a: LonLat, b: LonLat, v: Vue, n = 40): Pt[] => arc3D(a, b, n).map((p) => projeter(p, v));
/** Même arc posé au sol (son ombre sur la dalle). */
export const ombreArc = (a: LonLat, b: LonLat, v: Vue, n = 40): Pt[] => arc3D(a, b, n).map((p) => projeter({ ...p, z: 0 }, v));
/** Longueur d'une ligne brisée. */
export const longueur = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);

/** Le point est-il dans le polygone (lancer de rayon) ? */
export function dansPolygone(p: LonLat, poly: readonly LonLat[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}
/** Aire (signée) d'un polygone en degrés² : positive dans le sens trigonométrique. */
export const aire = (poly: readonly LonLat[]) => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);
/** Le polygone se recoupe-t-il lui-même ? (contrôle de saisie du contour) */
export function seRecoupe(poly: readonly LonLat[]): boolean {
  const n = poly.length, o = (a: LonLat, b: LonLat, c: LonLat) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = poly[i], b = poly[(i + 1) % n], c = poly[j], d = poly[(j + 1) % n];
    if (o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)) return true;
  }
  return false;
}

// ---- étiquettes sans chevauchement
export interface EtiquetteEntree { id: string; x: number; y: number; /** Largeur et hauteur de l'étiquette. */ l: number; h: number; pref: Cote; /** 0 = la plus importante (placée la première). */ rang: number }
interface Rect { x0: number; y0: number; x1: number; y1: number }
const rectDe = (e: EtiquetteEntree, c: Cote8, ecart: number): Rect => {
  const q = ecart * 0.55;
  if (c === 'hg') return { x0: e.x - q - e.l, x1: e.x - q, y0: e.y - ecart - e.h + 2, y1: e.y - ecart + 2 };
  if (c === 'hd') return { x0: e.x + q, x1: e.x + q + e.l, y0: e.y - ecart - e.h + 2, y1: e.y - ecart + 2 };
  if (c === 'bg') return { x0: e.x - q - e.l, x1: e.x - q, y0: e.y + ecart - 2, y1: e.y + ecart - 2 + e.h };
  if (c === 'bd') return { x0: e.x + q, x1: e.x + q + e.l, y0: e.y + ecart - 2, y1: e.y + ecart - 2 + e.h };
  return rectCote(e, c, ecart);
};
const rectCote = (e: EtiquetteEntree, c: Cote, ecart: number): Rect =>
  c === 'd' ? { x0: e.x + ecart, x1: e.x + ecart + e.l, y0: e.y - e.h / 2, y1: e.y + e.h / 2 } : c === 'g' ? { x0: e.x - ecart - e.l, x1: e.x - ecart, y0: e.y - e.h / 2, y1: e.y + e.h / 2 }
    : c === 'h' ? { x0: e.x - e.l / 2, x1: e.x + e.l / 2, y0: e.y - ecart - e.h, y1: e.y - ecart } : { x0: e.x - e.l / 2, x1: e.x + e.l / 2, y0: e.y + ecart, y1: e.y + ecart + e.h };
const recouvrement = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
/** Choisit le côté de chaque étiquette (préféré d'abord) pour qu'aucune ne recouvre une autre étiquette ni un point, en restant dans `cadre`. Les plus importantes passent en premier ;
 *  une étiquette de rang > 1 qui ne trouve aucune place est masquée (null), les autres prennent la moins mauvaise. */
export function placerEtiquettes(items: EtiquetteEntree[], cadre: { w: number; h: number }, rayon = 8, ecart = 10): Record<string, Cote8 | null> {
  const res: Record<string, Cote8 | null> = {}, posees: Rect[] = [], ordre = items.map((e, i) => ({ e, i })).sort((a, b) => a.e.rang - b.e.rang || a.i - b.i);
  for (const { e } of ordre) {
    const disques = items.filter((o) => o !== e).map((o): Rect => ({ x0: o.x - rayon, x1: o.x + rayon, y0: o.y - rayon, y1: o.y + rayon }));
    let meilleur: { c: Cote8; cout: number } | null = null;
    for (const c of [e.pref, ...(['d', 'g', 'h', 'b', 'bg', 'bd', 'hg', 'hd'] as Cote8[]).filter((k) => k !== e.pref)]) {
      const r = rectDe(e, c, ecart), dehors = r.x0 < 2 || r.x1 > cadre.w - 2 || r.y0 < 2 || r.y1 > cadre.h - 2;
      const cout = [...posees, ...disques].reduce((s, o) => s + recouvrement(r, o), 0) + (dehors ? 1e4 : 0);
      if (cout === 0) { meilleur = { c, cout }; break; }
      if (!meilleur || cout < meilleur.cout) meilleur = { c, cout };
    }
    if (meilleur && meilleur.cout === 0) { res[e.id] = meilleur.c; posees.push(rectDe(e, meilleur.c, ecart)); }
    else if (e.rang <= 1 && meilleur) { res[e.id] = meilleur.c; posees.push(rectDe(e, meilleur.c, ecart)); } else res[e.id] = null;
  }
  return res;
}
