// Analyses du siège : recettes, remplissage, tendances et comparaisons, calculées à partir des départs et billets du monde simulé.
// Les billets réels (vendus dans l'application) comptent pour leur prix. Les sièges déjà pris par d'autres voyageurs (`prisAilleurs`)
// comptent comme ventes de démonstration. Pour les jours passés sans ces données, on dérive des ventes du taux de remplissage moyen
// des départs de la même ligne et de la même heure (jour de semaine et petite variation déterministes) : toujours signalées « démo ».
import { ajouterJours, enDate, type Jour } from './dates.ts';

export interface LigneA { id: string; de: string; vers: string; gareDe: string; compagnieId: string; classe: string; prix: number; dureeMin: number; horaires: string[] }
export interface DepartA { id: string; ligneId: string; jour: Jour; heure: string; busId: string; capacite: number; prix: number; statut: string; retardMin: number; prisAilleurs: number }
export interface BilletA { departId: string; prix: number; statut: string }
export type SourceVente = 'reel' | 'demo' | 'mixte';
export interface VenteDepart {
  departId: string; ligneId: string; compagnieId: string; gareDe: string; de: string; vers: string; classe: string; busId: string; jour: Jour; heure: string;
  capacite: number; prix: number; billets: number; recette: number; /** Billets réellement vendus dans l'application. */ reels: number; recetteReelle: number;
  taux: number; statut: string; retardMin: number; source: SourceVente; /** Départ reconstitué (absent du monde simulé). */ virtuel: boolean;
}

/** Retard à partir duquel un départ n'est plus « à l'heure ». */
export const SEUIL_RETARD_MIN = 15;
/** Coût estimé d'un trajet (carburant + péages), en F par minute de route : simulation. */
export const COUT_MIN = 300;
export const OBJECTIF_REMPLISSAGE = 0.85;
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const FACTEUR_JOUR = [0.95, 0.9, 0.85, 0.9, 0.95, 1.15, 1.1];
export const nomJour = (j: Jour) => JOURS[enDate(j).getDay()];

/** Nombre pseudo-aléatoire stable entre 0 et 1 pour une chaîne. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

interface Reference { taux: number; capacite: number; prix: number; busId: string }
function references(departs: DepartA[], aujourdhui: Jour): Map<string, Reference> {
  const cumul = new Map<string, { s: number; n: number; d: DepartA }>();
  for (const d of departs) {
    if (d.jour < aujourdhui || d.prisAilleurs === 0) continue;
    const k = `${d.ligneId}|${d.heure}`, c = cumul.get(k) ?? { s: 0, n: 0, d };
    c.s += d.prisAilleurs / d.capacite; c.n++; cumul.set(k, c);
  }
  const res = new Map<string, Reference>();
  for (const [k, c] of cumul) res.set(k, { taux: c.s / c.n, capacite: c.d.capacite, prix: c.d.prix, busId: c.d.busId });
  return res;
}

/** Ventes de chaque départ de la période [debut, fin] (jusqu'à aujourd'hui compris : on n'analyse pas l'avenir). */
export function ventes(p: { lignes: LigneA[]; departs: DepartA[]; billets: BilletA[]; aujourdhui: Jour; debut: Jour; fin: Jour }): VenteDepart[] {
  const fin = p.fin > p.aujourdhui ? p.aujourdhui : p.fin;
  if (fin < p.debut) return [];
  const refs = references(p.departs, p.aujourdhui), lignes = new Map(p.lignes.map((l) => [l.id, l]));
  const reels = new Map<string, { n: number; somme: number }>();
  for (const b of p.billets) if (b.statut === 'valide' || b.statut === 'scanne') { const r = reels.get(b.departId) ?? { n: 0, somme: 0 }; r.n++; r.somme += b.prix; reels.set(b.departId, r); }
  const parJour = new Map<Jour, DepartA[]>();
  for (const d of p.departs) if (d.jour >= p.debut && d.jour <= fin) { const l = parJour.get(d.jour); if (l) l.push(d); else parJour.set(d.jour, [d]); }
  const res: VenteDepart[] = [];
  const pousser = (d: DepartA, virtuel: boolean) => {
    const l = lignes.get(d.ligneId); if (!l) return;
    const r = reels.get(d.id) ?? { n: 0, somme: 0 }, annule = d.statut === 'annule';
    let demo = 0;
    if (!annule) {
      if (d.prisAilleurs > 0) demo = d.prisAilleurs;
      else if (d.jour < p.aujourdhui) { const ref = refs.get(`${d.ligneId}|${d.heure}`); demo = Math.round(d.capacite * Math.min(0.98, (ref?.taux ?? 0.6) * FACTEUR_JOUR[enDate(d.jour).getDay()] * (0.9 + 0.2 * hash01(`${d.id}|t`)))); }
      demo = Math.max(0, Math.min(demo, d.capacite - r.n));
    }
    const billets = annule ? 0 : r.n + demo;
    res.push({ departId: d.id, ligneId: l.id, compagnieId: l.compagnieId, gareDe: l.gareDe, de: l.de, vers: l.vers, classe: l.classe, busId: d.busId, jour: d.jour, heure: d.heure, capacite: d.capacite, prix: d.prix,
      billets, recette: annule ? 0 : r.somme + demo * d.prix, reels: annule ? 0 : r.n, recetteReelle: annule ? 0 : r.somme, taux: d.capacite ? billets / d.capacite : 0, statut: d.statut, retardMin: d.retardMin,
      source: demo === 0 ? 'reel' : r.n === 0 ? 'demo' : 'mixte', virtuel });
  };
  for (let j = p.debut; j <= fin; j = ajouterJours(j, 1)) {
    const reelsDuJour = parJour.get(j) ?? [], vus = new Set(reelsDuJour.map((d) => `${d.ligneId}|${d.heure}`));
    for (const d of reelsDuJour) pousser(d, false);
    if (j >= p.aujourdhui) continue;
    for (const l of p.lignes) for (const h of l.horaires) {
      if (vus.has(`${l.id}|${h}`)) continue;
      const ref = refs.get(`${l.id}|${h}`), id = `v-${j}-${l.id}-${h}`, tard = hash01(`${id}|r`) > 0.9;
      pousser({ id, ligneId: l.id, jour: j, heure: h, busId: ref?.busId ?? `bus-${l.compagnieId}-${l.classe[0]}1`, capacite: ref?.capacite ?? (l.classe === 'VIP' ? 30 : 50), prix: ref?.prix ?? l.prix, statut: 'arrive',
        retardMin: tard ? 15 + Math.floor(hash01(`${id}|s`) * 30) : 0, prisAilleurs: 0 }, true);
    }
  }
  return res;
}

export interface Agregat { recette: number; recetteReelle: number; billets: number; capacite: number; taux: number; departs: number; annules: number; partis: number; retards: number; auHeure: number }
export function agreger(v: VenteDepart[]): Agregat {
  const a: Agregat = { recette: 0, recetteReelle: 0, billets: 0, capacite: 0, taux: 0, departs: 0, annules: 0, partis: 0, retards: 0, auHeure: 1 };
  for (const x of v) {
    if (x.statut === 'annule') { a.annules++; continue; }
    a.departs++; a.recette += x.recette; a.recetteReelle += x.recetteReelle; a.billets += x.billets; a.capacite += x.capacite;
    if (x.statut === 'parti' || x.statut === 'arrive') { a.partis++; if (x.retardMin >= SEUIL_RETARD_MIN) a.retards++; }
  }
  a.taux = a.capacite ? a.billets / a.capacite : 0;
  a.auHeure = a.partis ? 1 - a.retards / a.partis : 1;
  return a;
}

export type CodePeriode = 'jour' | 'semaine' | 'mois';
export interface Periode { code: CodePeriode; debut: Jour; fin: Jour; precDebut: Jour; precFin: Jour; nb: number; comparaison: string }
/** Jour : comparé au même jour de la semaine précédente ; semaine (7 j) et mois (30 j) : comparés à la période de même longueur juste avant. */
export function periode(code: CodePeriode, aujourdhui: Jour): Periode {
  if (code === 'jour') { const prec = ajouterJours(aujourdhui, -7); return { code, debut: aujourdhui, fin: aujourdhui, precDebut: prec, precFin: prec, nb: 1, comparaison: `vs ${nomJour(aujourdhui)} dernier` }; }
  const nb = code === 'semaine' ? 7 : 30, debut = ajouterJours(aujourdhui, -(nb - 1)), precFin = ajouterJours(debut, -1);
  return { code, debut, fin: aujourdhui, precDebut: ajouterJours(precFin, -(nb - 1)), precFin, nb, comparaison: code === 'semaine' ? 'vs semaine passée' : 'vs mois précédent' };
}
export interface Comparaison { delta: number; pct: number | null; sens: 'hausse' | 'baisse' | 'stable' }
export function comparer(courant: number, precedent: number): Comparaison {
  const delta = courant - precedent, pct = precedent > 0 ? Math.round((delta / precedent) * 100) : null;
  return { delta, pct, sens: pct === null || Math.abs(pct) < 1 ? 'stable' : pct > 0 ? 'hausse' : 'baisse' };
}
export const entre = (v: VenteDepart[], debut: Jour, fin: Jour) => v.filter((x) => x.jour >= debut && x.jour <= fin);

export interface PointJour { jour: Jour; recette: number; billets: number }
/** Une valeur par jour, de `debut` pendant `nb` jours (0 les jours sans départ). */
export function serieJours(v: VenteDepart[], debut: Jour, nb: number): PointJour[] {
  const pts: PointJour[] = Array.from({ length: nb }, (_, i) => ({ jour: ajouterJours(debut, i), recette: 0, billets: 0 })), idx = new Map(pts.map((p, i) => [p.jour, i]));
  for (const x of v) { const i = idx.get(x.jour); if (i !== undefined && x.statut !== 'annule') { pts[i].recette += x.recette; pts[i].billets += x.billets; } }
  return pts;
}

export interface Ligne3 { cle: string; departs: number; billets: number; capacite: number; taux: number; recette: number }
function grouper(v: VenteDepart[], cle: (x: VenteDepart) => string): Ligne3[] {
  const m = new Map<string, Ligne3>();
  for (const x of v) {
    if (x.statut === 'annule') continue;
    const k = cle(x), g = m.get(k) ?? { cle: k, departs: 0, billets: 0, capacite: 0, taux: 0, recette: 0 };
    g.departs++; g.billets += x.billets; g.capacite += x.capacite; g.recette += x.recette; m.set(k, g);
  }
  for (const g of m.values()) g.taux = g.capacite ? g.billets / g.capacite : 0;
  return [...m.values()].sort((a, b) => b.recette - a.recette);
}
export const parLigne = (v: VenteDepart[]) => grouper(v, (x) => x.ligneId);
export const parBus = (v: VenteDepart[]) => grouper(v, (x) => x.busId);
export const parGare = (v: VenteDepart[]) => grouper(v, (x) => x.gareDe);
export const topLignes = (lignes: Ligne3[], n = 5) => lignes.slice(0, n);

export interface Tendance { pente: number; pct: number; sens: 'hausse' | 'baisse' | 'stable'; joursDeBaisse: number }
/** Tendance d'une série quotidienne : pente des moindres carrés, variation totale en % de la moyenne, jours de baisse consécutifs en fin de série. */
export function tendance(serie: number[]): Tendance {
  const n = serie.length;
  if (n < 2) return { pente: 0, pct: 0, sens: 'stable', joursDeBaisse: 0 };
  const mx = (n - 1) / 2, my = serie.reduce((s, y) => s + y, 0) / n;
  let cov = 0, vx = 0;
  serie.forEach((y, i) => { cov += (i - mx) * (y - my); vx += (i - mx) ** 2; });
  const pente = cov / vx, pct = my ? Math.round(((pente * (n - 1)) / my) * 100) : 0;
  let jb = 0;
  for (let i = n - 1; i > 0 && serie[i] < serie[i - 1]; i--) jb++;
  return { pente, pct, sens: pct >= 3 ? 'hausse' : pct <= -3 ? 'baisse' : 'stable', joursDeBaisse: jb };
}

export const HEURES_CARTE = [5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20] as const;
const tranche = (heure: string) => { const h = Number(heure.slice(0, 2)); let k = 0; HEURES_CARTE.forEach((b, i) => { if (b <= h) k = i; }); return k; };
/** Carte de chaleur : 7 lignes (lundi à dimanche) × 12 tranches horaires, taux moyen de remplissage ou null s'il n'y a aucun départ. */
export function remplissageHeure(v: VenteDepart[]): (number | null)[][] {
  const somme = Array.from({ length: 7 }, () => Array(12).fill(0)), n = Array.from({ length: 7 }, () => Array(12).fill(0));
  for (const x of v) { if (x.statut === 'annule') continue; const d = (enDate(x.jour).getDay() + 6) % 7, h = tranche(x.heure); somme[d][h] += x.taux; n[d][h]++; }
  return somme.map((r, d) => r.map((s, h) => (n[d][h] ? s / n[d][h] : null)));
}

/** Simulateur de prix : chaque 500 F en moins ajoute 12 points de remplissage (mêmes bornes que la maquette : 20 à 98 %). */
export function simulerPrix(base: { prix: number; taux: number; capacite: number }, nouveau: number): { taux: number; recetteBus: number } {
  const taux = Math.max(0.2, Math.min(0.98, base.taux + ((base.prix - nouveau) / 500) * 0.12));
  return { taux, recetteBus: Math.round(base.capacite * taux) * nouveau };
}
export const margeBus = (recetteBus: number, dureeMin: number) => recetteBus - COUT_MIN * dureeMin;
/** Prix le plus bas d'une autre compagnie sur la même liaison et la même classe. */
export function concurrence(lignes: LigneA[], l: LigneA): { prix: number; compagnieId: string; heure: string } | null {
  let m: LigneA | null = null;
  for (const x of lignes) if (x.id !== l.id && x.compagnieId !== l.compagnieId && x.de === l.de && x.vers === l.vers && x.classe === l.classe && (!m || x.prix < m.prix)) m = x;
  return m ? { prix: m.prix, compagnieId: m.compagnieId, heure: m.horaires[0] ?? '' } : null;
}
