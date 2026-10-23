// Pilotage interne : indicateurs agrégés (fonctions pures). Les données viennent de deux sources :
// une « population simulée » (échelle de milliers de membres, voir portals/pilotage/base.ts) et le vrai compte local.
import { NIVEAUX, niveauDuScore, type Niveau } from './credit.ts';
import { ecrireCsv } from './csv.ts';
import { jourDe, moisAnnee, type Jour } from './dates.ts';

export type Produit = 'ecole' | 'logement' | 'auto' | 'solaire' | 'commerce' | 'sante';
export const PRODUITS: readonly { cle: Produit; libelle: string }[] = [
  { cle: 'ecole', libelle: 'École' }, { cle: 'auto', libelle: 'Auto' }, { cle: 'logement', libelle: 'Logement' },
  { cle: 'commerce', libelle: 'Avances commerce' }, { cle: 'solaire', libelle: 'Solaire' }, { cle: 'sante', libelle: 'Santé étalée' }
];
export type FiltreProduit = Produit | 'tous';
export interface Filtre { periode: number; produit: FiltreProduit }
export const NB_PERIODES = 3;
export const ETIQUETTE_SIMULEE = 'Population simulée';

// ------------------------------------------------------------------ entrées (lecture seule)
export interface CreditLu { produit: string; capital: number; mensualite: number; duree: number; payees: number; statut: string }
export interface MouvementLu { ts: number; titre: string; montant: number; categorie: string }
export interface FactureLue { statut: string; date: Jour; echeance: Jour; total: number; assureMe: number; partPatient: number; aTemps?: boolean }
export interface CoffreLu { epargne: number; objectif: number; mensuel: number; auto: boolean }
/** Opérations d'un partenaire lues dans une tranche ; sans `ts`, c'est un stock (compté pour le mois courant seulement). */
export interface ActiviteLue { cle: CleActivite; operations: number; volume: number; ts?: number }
export interface EntreeLocale {
  compte: { salaireNet: number; cree: number } | null;
  credits: CreditLu[]; mouvements: MouvementLu[]; notifications: { titre: string; sous: string }[];
  score: number | null; factures: FactureLue[]; coffres: CoffreLu[]; activite: ActiviteLue[];
}
export const entreeVide = (): EntreeLocale => ({ compte: null, credits: [], mouvements: [], notifications: [], score: null, factures: [], coffres: [], activite: [] });

export type CleActivite = 'employeurs' | 'ecoles' | 'hopitaux' | 'concessions' | 'commerces' | 'autres';
export const ACTIVITES: readonly { cle: CleActivite; libelle: string; unite: string }[] = [
  { cle: 'employeurs', libelle: 'Employeurs', unite: 'retenues de paie' }, { cle: 'ecoles', libelle: 'Écoles', unite: 'paiements de frais' },
  { cle: 'hopitaux', libelle: 'Hôpitaux et cliniques', unite: 'factures' }, { cle: 'concessions', libelle: 'Concessions auto', unite: 'dossiers' },
  { cle: 'commerces', libelle: 'Commerces', unite: 'encaissements' }, { cle: 'autres', libelle: 'Autres partenaires', unite: 'opérations' }
];

// ------------------------------------------------------------------ population simulée
export interface BasePeriode {
  encours: Record<Produit, number>; membres: number; credits: number; retards: number;
  partenaires: Record<CleActivite, number>;
}
export interface BasePopulation {
  /** Du mois courant (0) vers les mois précédents. */ periodes: BasePeriode[];
  /** Emprunteurs par classe de part de salaire (mois courant). */ partSalaire: number[];
  niveaux: Record<Niveau, number>;
  sante: { factures: number; volume: number; assureMe: number; enRetard: number };
  coffres: { nb: number; epargne: number; mensuel: number };
  activite: Record<CleActivite, { operations: number; volume: number }>;
  /** Prélèvements sur paie, du plus ancien au mois courant (au moins NB_PERIODES + 5 points). */
  paie: { salaires: number; credits: number; coffres: number; pass: number }[];
  /** Besoin de trésorerie (millions de FCFA), janvier à décembre. */ tresorerie: number[];
}

// ------------------------------------------------------------------ utilitaires
export const pct1 = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
/** Répartit `cible` au prorata de `poids` (plus fort reste : la somme est exacte). */
export function repartir(poids: number[], cible: number): number[] {
  const total = poids.reduce((s, p) => s + p, 0);
  if (total <= 0 || cible <= 0) return poids.map(() => 0);
  const brut = poids.map((p) => (p * cible) / total);
  const res = brut.map(Math.floor);
  let reste = Math.round(cible) - res.reduce((s, r) => s + r, 0);
  const ordre = brut.map((b, i) => ({ i, f: b - Math.floor(b) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of ordre) { if (reste-- <= 0) break; res[i]++; }
  return res;
}
const somme = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const zeroProduits = (): Record<Produit, number> => ({ ecole: 0, auto: 0, logement: 0, solaire: 0, commerce: 0, sante: 0 });
const estProduit = (p: string): p is Produit => PRODUITS.some((x) => x.cle === p);

export interface Periode { decalage: number; cle: string; libelle: string; debut: Jour; fin: Jour; debutTs: number; finTs: number }
/** Mois civil `decalage` mois avant celui de `now` (0 = mois courant). */
export function periodeDe(now: number, decalage: number): Periode {
  const d = new Date(now);
  const a = new Date(d.getFullYear(), d.getMonth() - decalage, 1, 12), b = new Date(a.getFullYear(), a.getMonth() + 1, 1, 12);
  const debut = jourDe(a);
  return { decalage, cle: debut.slice(0, 7), libelle: moisAnnee(debut), debut, fin: jourDe(b), debutTs: new Date(a.getFullYear(), a.getMonth(), 1).getTime(), finTs: new Date(b.getFullYear(), b.getMonth(), 1).getTime() };
}

// ------------------------------------------------------------------ crédits
/** Capital restant dû, amortissement linéaire (les crédits n'ont pas d'échéancier détaillé dans le magasin). */
export const encoursRestant = (c: CreditLu): number => (c.statut === 'termine' || c.duree <= 0 ? 0 : Math.round((c.capital * Math.max(0, c.duree - c.payees)) / c.duree));
export const enCours = (c: CreditLu) => c.statut !== 'termine';
export const selonProduit = (credits: CreditLu[], f: FiltreProduit) => credits.filter((c) => f === 'tous' || c.produit === f);
export function encoursParProduit(credits: CreditLu[]): Record<Produit, number> {
  const r = zeroProduits();
  for (const c of credits) if (estProduit(c.produit)) r[c.produit] += encoursRestant(c);
  return r;
}

// ------------------------------------------------------------------ part du salaire (règle des 33 %)
export interface ClassePart { cle: string; libelle: string; max: number; alerte: boolean }
export const CLASSES_PART: readonly ClassePart[] = [
  { cle: 'p10', libelle: 'Moins de 10 %', max: 10, alerte: false }, { cle: 'p20', libelle: '10 à 20 %', max: 20, alerte: false },
  { cle: 'p25', libelle: '20 à 25 %', max: 25, alerte: false }, { cle: 'p33', libelle: '25 à 33 %', max: 33, alerte: false },
  { cle: 'p99', libelle: 'Plus de 33 %', max: Infinity, alerte: true }
];
/** Classe d'un emprunteur ; la comparaison reste en entiers (33 % pile n'est pas une alerte). */
export function indexClassePart(mensualites: number, salaire: number): number {
  if (salaire <= 0) return CLASSES_PART.length - 1;
  const i = CLASSES_PART.findIndex((c) => mensualites * 100 <= salaire * c.max);
  return i < 0 ? CLASSES_PART.length - 1 : i;
}
export interface Emprunteur { salaire: number; mensualites: number }
export interface LigneClasse extends ClassePart { base: number; local: number; effectif: number }
export function distributionPart(base: number[], locaux: Emprunteur[]): { classes: LigneClasse[]; total: number; alertes: number; tauxAlerte: number } {
  const local = CLASSES_PART.map(() => 0);
  for (const m of locaux) if (m.mensualites > 0) local[indexClassePart(m.mensualites, m.salaire)]++;
  const classes = CLASSES_PART.map((c, i) => ({ ...c, base: base[i] ?? 0, local: local[i], effectif: (base[i] ?? 0) + local[i] }));
  const total = somme(classes.map((c) => c.effectif)), alertes = somme(classes.filter((c) => c.alerte).map((c) => c.effectif));
  return { classes, total, alertes, tauxAlerte: pct1(alertes, total) };
}

// ------------------------------------------------------------------ score
export interface LigneNiveau { niveau: Niveau; base: number; local: number; effectif: number; part: number }
export function repartitionNiveaux(base: Record<Niveau, number>, scores: number[]): { lignes: LigneNiveau[]; total: number } {
  const local: Record<Niveau, number> = { START: 0, PLUS: 0, PRO: 0, ELITE: 0 };
  for (const s of scores) local[niveauDuScore(s)]++;
  const total = somme(NIVEAUX.map((n) => base[n] + local[n]));
  return { total, lignes: NIVEAUX.map((n) => ({ niveau: n, base: base[n], local: local[n], effectif: base[n] + local[n], part: pct1(base[n] + local[n], total) })) };
}

// ------------------------------------------------------------------ retards et reports
export const depasseSeuil = (taux: number, seuil: number) => taux > seuil;
/** Les reports de prélèvement ne laissent pas de trace dans les crédits : on les relit dans les notifications de paie. */
export function reportsDePaie(notifs: { titre: string; sous: string }[]): { paies: number; paiesAvecReport: number; reports: number } {
  let paies = 0, paiesAvecReport = 0, reports = 0;
  for (const n of notifs) {
    if (!/^Salaire reçu, prélèvements faits/.test(n.titre)) continue;
    paies++;
    const m = /(\d+) reporté/.exec(n.sous);
    if (m && Number(m[1]) > 0) { paiesAvecReport++; reports += Number(m[1]); }
  }
  return { paies, paiesAvecReport, reports };
}

// ------------------------------------------------------------------ santé, coffres
export interface VolumeSante { factures: number; volume: number; assureMe: number; partPatient: number; reglees: number; enRetard: number; tauxRetard: number }
export function volumeSante(factures: FactureLue[], debut: Jour, fin: Jour, aujourdhui: Jour): VolumeSante {
  const f = factures.filter((x) => x.statut !== 'brouillon' && x.date >= debut && x.date < fin);
  const enRetard = f.filter((x) => (x.statut === 'a_regler' && x.echeance < aujourdhui) || x.aTemps === false).length;
  return {
    factures: f.length, volume: somme(f.map((x) => x.total)), assureMe: somme(f.map((x) => x.assureMe)), partPatient: somme(f.map((x) => x.partPatient)),
    reglees: f.filter((x) => x.statut === 'payee' || x.statut === 'etalee').length, enRetard, tauxRetard: pct1(enRetard, f.length)
  };
}
export const totalCoffres = (c: CoffreLu[]) => ({ nb: c.length, epargne: somme(c.map((x) => x.epargne)), objectif: somme(c.map((x) => x.objectif)), mensuel: somme(c.filter((x) => x.auto).map((x) => x.mensuel)) });

// ------------------------------------------------------------------ flux de la paie
export interface PointPaie { cle: string; libelle: string; salaires: number; credits: number; coffres: number; pass: number }
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const libelleMoisCourt = (cle: string) => MOIS_COURTS[Number(cle.slice(5, 7)) - 1] ?? cle;
const cleDe = (ts: number) => jourDe(new Date(ts)).slice(0, 7);
/** Classe un mouvement du compte dans un poste de la paie (null : sans rapport avec la paie). */
export function posteDePaie(m: MouvementLu): 'salaires' | 'credits' | 'coffres' | 'pass' | null {
  if (m.categorie === 'salaire' && m.montant > 0) return 'salaires';
  if (m.montant >= 0) return null;
  if (m.categorie === 'pass') return 'pass';
  if (m.categorie === 'coffre') return 'coffres';
  if (m.categorie === 'credit' || /^Mensualit/i.test(m.titre)) return 'credits';
  return null;
}
/** `n` mois se terminant par le mois `fin` (« 2026-10 »), du plus ancien au plus récent. */
export function fluxPaie(mouvements: MouvementLu[], fin: Periode, n: number): PointPaie[] {
  const pts: PointPaie[] = [];
  for (let i = n - 1; i >= 0; i--) { const p = periodeDe(fin.debutTs + 15 * 86_400_000, i); pts.push({ cle: p.cle, libelle: libelleMoisCourt(p.cle), salaires: 0, credits: 0, coffres: 0, pass: 0 }); }
  for (const m of mouvements) {
    const poste = posteDePaie(m); const pt = poste && pts.find((p) => p.cle === cleDe(m.ts));
    if (poste && pt) pt[poste] += Math.abs(m.montant);
  }
  return pts;
}

// ------------------------------------------------------------------ échelles et tracés SVG
/** Plafond « rond » et graduations d'un axe (jusqu'à environ 4 intervalles). */
export function echelle(max: number): { max: number; graduations: number[] } {
  if (!(max > 0)) return { max: 1, graduations: [0, 1] };
  const brut = max / 4, mag = 10 ** Math.floor(Math.log10(brut)), n = brut / mag;
  const pas = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag, haut = Math.ceil(max / pas - 1e-9) * pas;
  const graduations: number[] = [];
  for (let v = 0; v <= haut + pas / 2; v += pas) graduations.push(Math.round(v * 1e6) / 1e6);
  return { max: haut, graduations };
}
export interface Zone { x0: number; x1: number; y0: number; y1: number }
/** Points d'une courbe dans la zone (y0 = bas, y1 = haut). Une seule valeur : point centré. */
export function pointsCourbe(valeurs: number[], z: Zone, max: number): { x: number; y: number }[] {
  const n = valeurs.length;
  return valeurs.map((v, i) => ({ x: n === 1 ? (z.x0 + z.x1) / 2 : z.x0 + ((z.x1 - z.x0) * i) / (n - 1), y: z.y0 - ((z.y0 - z.y1) * Math.max(0, v)) / (max || 1) }));
}
export const cheminCourbe = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
/** Arc de jauge (demi-cercle) de 0 à `frac` (0..1) : centre (cx, cy), rayon r. */
export function arcJauge(cx: number, cy: number, r: number, frac: number): string {
  const f = Math.max(0, Math.min(1, frac)), a = Math.PI * (1 - f);
  const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a);
  return f <= 0 ? '' : `M${(cx - r).toFixed(1)} ${cy} A${r} ${r} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`;
}

// ------------------------------------------------------------------ assemblage
export interface LigneProduit { cle: Produit; libelle: string; base: number; local: number; valeur: number; part: number }
export interface LigneActivite { cle: CleActivite; libelle: string; unite: string; partenaires: number; operations: number; volume: number; local: number }
export interface Indicateurs {
  periode: Periode; filtre: Filtre; stockLocal: boolean; compteLocal: boolean;
  membres: { base: number; local: number; total: number };
  partenaires: { total: number; detail: string };
  encours: { total: number; base: number; local: number; lignes: LigneProduit[] };
  retards: { credits: number; retards: number; taux: number; local: { credits: number; retards: number } };
  reports: ReturnType<typeof reportsDePaie>;
  partSalaire: ReturnType<typeof distributionPart>;
  niveaux: ReturnType<typeof repartitionNiveaux>;
  sante: VolumeSante & { base: VolumeSante; local: VolumeSante };
  coffres: { nb: number; epargne: number; mensuel: number; local: { nb: number; epargne: number } };
  paie: { base: PointPaie[]; local: PointPaie[]; total: PointPaie[] };
  activite: LigneActivite[];
  tresorerie: number[];
}

export function calculer(e: EntreeLocale, base: BasePopulation, f: Filtre, now: number): Indicateurs {
  const periode = periodeDe(now, f.periode), bp = base.periodes[f.periode] ?? base.periodes[0], b0 = base.periodes[0];
  const ratio = bp.membres / b0.membres, mise = (n: number) => Math.round(n * ratio);
  const compteLocal = !!e.compte && e.compte.cree < periode.finTs;
  // Pas d'historique des crédits, des coffres ni du score : ils ne comptent que pour le mois courant.
  const stockLocal = compteLocal && f.periode === 0;
  const totalBase = somme(Object.values(bp.encours)), part = f.produit === 'tous' || totalBase <= 0 ? 1 : bp.encours[f.produit] / totalBase;
  const creditsLocaux = stockLocal ? selonProduit(e.credits, f.produit).filter(enCours) : [];

  const lignesP = PRODUITS.filter((p) => f.produit === 'tous' || p.cle === f.produit).map((p) => {
    const local = somme(creditsLocaux.filter((c) => c.produit === p.cle).map(encoursRestant));
    return { cle: p.cle, libelle: p.libelle, base: bp.encours[p.cle], local, valeur: bp.encours[p.cle] + local, part: 0 };
  });
  const encTotal = somme(lignesP.map((l) => l.valeur));
  lignesP.forEach((l) => (l.part = pct1(l.valeur, encTotal)));

  const creditsBase = Math.round(bp.credits * part), retardsBase = Math.round(bp.retards * part);
  const retardsLocaux = creditsLocaux.filter((c) => c.statut === 'reporte').length;
  const emprunteur = stockLocal && creditsLocaux.length && e.compte ? [{ salaire: e.compte.salaireNet, mensualites: somme(creditsLocaux.map((c) => c.mensualite)) }] : [];

  const jourFin = periode.fin, aujourdhui = jourDe(new Date(now));
  const sBase = { factures: mise(base.sante.factures), volume: mise(base.sante.volume), assureMe: mise(base.sante.assureMe), enRetard: mise(base.sante.enRetard) };
  const sBaseV: VolumeSante = { ...sBase, partPatient: sBase.volume - sBase.assureMe, reglees: sBase.factures - sBase.enRetard, tauxRetard: pct1(sBase.enRetard, sBase.factures) };
  const sLocal = compteLocal ? volumeSante(e.factures, periode.debut, jourFin, aujourdhui) : volumeSante([], periode.debut, jourFin, aujourdhui);
  const sTot = { factures: sBaseV.factures + sLocal.factures, volume: sBaseV.volume + sLocal.volume, assureMe: sBaseV.assureMe + sLocal.assureMe, partPatient: sBaseV.partPatient + sLocal.partPatient, reglees: sBaseV.reglees + sLocal.reglees, enRetard: sBaseV.enRetard + sLocal.enRetard };

  const cLocal = stockLocal ? totalCoffres(e.coffres) : { nb: 0, epargne: 0, objectif: 0, mensuel: 0 };
  const nPaie = base.paie.length, pBase: PointPaie[] = [];
  for (let i = NB_PERIODES + 2; i >= 0; i--) {
    const src = base.paie[nPaie - 1 - f.periode - i], p = periodeDe(now, f.periode + i);
    pBase.push({ cle: p.cle, libelle: libelleMoisCourt(p.cle), salaires: src?.salaires ?? 0, credits: src?.credits ?? 0, coffres: src?.coffres ?? 0, pass: src?.pass ?? 0 });
  }
  const pLocal = fluxPaie(compteLocal ? e.mouvements : [], periode, pBase.length);
  const paieTotal = pBase.map((b, i) => ({ ...b, salaires: b.salaires + pLocal[i].salaires, credits: b.credits + pLocal[i].credits, coffres: b.coffres + pLocal[i].coffres, pass: b.pass + pLocal[i].pass }));

  const activite = ACTIVITES.map((a) => {
    const b = base.activite[a.cle], l = compteLocal ? e.activite.filter((x) => x.cle === a.cle && (x.ts === undefined ? stockLocal : x.ts >= periode.debutTs && x.ts < periode.finTs)) : [];
    const lo = somme(l.map((x) => x.operations)), lv = somme(l.map((x) => x.volume));
    return { cle: a.cle, libelle: a.libelle, unite: a.unite, partenaires: bp.partenaires[a.cle], operations: mise(b.operations) + lo, volume: mise(b.volume) + lv, local: lo };
  });
  const nbPart = somme(Object.values(bp.partenaires)), aut = bp.partenaires.concessions + bp.partenaires.commerces + bp.partenaires.autres;
  const nivBase = repartir(NIVEAUX.map((n) => base.niveaux[n]), bp.membres);
  const niveaux = repartitionNiveaux(Object.fromEntries(NIVEAUX.map((n, k) => [n, nivBase[k]])) as Record<Niveau, number>, stockLocal && e.score != null ? [e.score] : []);
  return {
    periode, filtre: f, stockLocal, compteLocal,
    membres: { base: bp.membres, local: compteLocal ? 1 : 0, total: bp.membres + (compteLocal ? 1 : 0) },
    partenaires: { total: nbPart, detail: `${bp.partenaires.employeurs} employeurs, ${bp.partenaires.ecoles} écoles, ${bp.partenaires.hopitaux} hôpitaux, ${aut} autres` },
    encours: { total: encTotal, base: somme(lignesP.map((l) => l.base)), local: somme(lignesP.map((l) => l.local)), lignes: lignesP },
    retards: { credits: creditsBase + creditsLocaux.length, retards: retardsBase + retardsLocaux, taux: pct1(retardsBase + retardsLocaux, creditsBase + creditsLocaux.length), local: { credits: creditsLocaux.length, retards: retardsLocaux } },
    reports: compteLocal ? reportsDePaie(e.notifications) : { paies: 0, paiesAvecReport: 0, reports: 0 },
    partSalaire: distributionPart(repartir(base.partSalaire, creditsBase), emprunteur),
    niveaux,
    sante: { ...sTot, tauxRetard: pct1(sTot.enRetard, sTot.factures), base: sBaseV, local: sLocal },
    coffres: { nb: mise(base.coffres.nb) + cLocal.nb, epargne: mise(base.coffres.epargne) + cLocal.epargne, mensuel: mise(base.coffres.mensuel) + cLocal.mensuel, local: { nb: cLocal.nb, epargne: cLocal.epargne } },
    paie: { base: pBase, local: pLocal, total: paieTotal },
    activite, tresorerie: base.tresorerie
  };
}

// ------------------------------------------------------------------ export CSV
const LIBELLE_PRODUIT = (f: FiltreProduit) => (f === 'tous' ? 'Tous les produits' : PRODUITS.find((p) => p.cle === f)?.libelle ?? f);
/** Lignes du rapport : une ligne par indicateur, avec l'origine des chiffres (population simulée / compte local). */
export function lignesCsv(i: Indicateurs): (string | number)[][] {
  const L: (string | number)[][] = [
    ['Rapport de pilotage AssureMe'], ['Période', i.periode.libelle], ['Produit', LIBELLE_PRODUIT(i.filtre.produit)],
    ['Origine', `${ETIQUETTE_SIMULEE} + compte local ${i.compteLocal ? 'inclus' : 'non inclus'}`], [],
    ['Rubrique', 'Indicateur', ETIQUETTE_SIMULEE, 'Compte local', 'Total', 'Unité']
  ];
  const add = (r: string, n: string, b: number, l: number, u: string) => L.push([r, n, b, l, b + l, u]);
  add('Général', 'Membres actifs', i.membres.base, i.membres.local, 'membres');
  add('Encours', 'Encours total', i.encours.base, i.encours.local, 'FCFA');
  for (const p of i.encours.lignes) add('Encours par produit', p.libelle, p.base, p.local, 'FCFA');
  add('Risque', 'Crédits en cours', i.retards.credits - i.retards.local.credits, i.retards.local.credits, 'crédits');
  add('Risque', 'Crédits en retard (reportés)', i.retards.retards - i.retards.local.retards, i.retards.local.retards, 'crédits');
  L.push(['Risque', 'Taux de retard', '', '', i.retards.taux, '%']);
  L.push(['Risque', 'Paies avec prélèvement reporté (compte local)', '', i.reports.paiesAvecReport, i.reports.paiesAvecReport, 'paies']);
  for (const c of i.partSalaire.classes) add('Mensualités / salaire', c.libelle, c.base, c.local, 'emprunteurs');
  L.push(['Mensualités / salaire', 'Alertes au-dessus de 33 %', '', '', i.partSalaire.alertes, 'emprunteurs']);
  for (const n of i.niveaux.lignes) add('Score', `Niveau ${n.niveau}`, n.base, n.local, 'membres');
  add('Santé', 'Factures émises', i.sante.base.factures, i.sante.local.factures, 'factures');
  add('Santé', 'Volume de paiements', i.sante.base.volume, i.sante.local.volume, 'FCFA');
  add('Santé', 'Factures en retard', i.sante.base.enRetard, i.sante.local.enRetard, 'factures');
  add('Coffres', 'Coffres ouverts', i.coffres.nb - i.coffres.local.nb, i.coffres.local.nb, 'coffres');
  add('Coffres', 'Total épargné', i.coffres.epargne - i.coffres.local.epargne, i.coffres.local.epargne, 'FCFA');
  i.paie.base.forEach((b, k) => {
    const l = i.paie.local[k];
    add('Flux de la paie', `Salaires ${b.cle}`, b.salaires, l.salaires, 'FCFA'); add('Flux de la paie', `Crédits ${b.cle}`, b.credits, l.credits, 'FCFA');
    add('Flux de la paie', `Coffres ${b.cle}`, b.coffres, l.coffres, 'FCFA'); add('Flux de la paie', `Pass ${b.cle}`, b.pass, l.pass, 'FCFA');
  });
  for (const a of i.activite) { L.push(['Partenaires', `${a.libelle} · partenaires`, a.partenaires, '', a.partenaires, 'partenaires']); L.push(['Partenaires', `${a.libelle} · ${a.unite}`, a.operations - a.local, a.local, a.operations, 'opérations']); }
  return L;
}
export const csvPilotage = (i: Indicateurs) => ecrireCsv(lignesCsv(i));
