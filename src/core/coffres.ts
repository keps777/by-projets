// Règles des coffres d'épargne (pures, testées) : intérêts mensuels, versement automatique, retrait, validation.
// Les constantes de base (taux, objectif, date) restent dans epargne.ts.
import { ajouterMois, type Jour } from './dates.ts';
import { dateObjectif, interetMensuel, moisPourAtteindre, partParMembre } from './epargne.ts';

export const OBJECTIF_MIN = 10_000;
export const OBJECTIF_MAX = 100_000_000;
export const MENSUEL_MIN = 1_000;
/** Pénalité de retrait anticipé (au-delà de l'unique retrait d'urgence gratuit de l'année), sur le montant retiré. */
export const TAUX_PENALITE = 0.02;
export const NOM_MAX = 24;
export const MEMBRES_MIN = 2;
export const MEMBRES_MAX = 8;

/** « 2026-10 » */
export type MoisCle = string;
export const moisDe = (j: Jour | number | Date): MoisCle => {
  if (typeof j === 'string') return j.slice(0, 7);
  const d = new Date(j); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const moisSuivant = (m: MoisCle): MoisCle => ajouterMois(m + '-01', 1).slice(0, 7);
export const moisPrecedent = (m: MoisCle): MoisCle => ajouterMois(m + '-01', -1).slice(0, 7);

/** Mois dont les intérêts sont à créditer : ceux qui suivent `dernier` et sont terminés à la date `aujourdhui`. */
export function moisACrediter(dernier: MoisCle, aujourdhui: Jour): MoisCle[] {
  const dernierTermine = moisPrecedent(moisDe(aujourdhui));
  const res: MoisCle[] = [];
  let m = moisSuivant(dernier);
  while (m <= dernierTermine && res.length < 600) { res.push(m); m = moisSuivant(m); }
  return res;
}
/** Intérêts successifs (composés) pour `n` mois, solde de départ `solde`. */
export function interetsSurMois(solde: number, n: number): { total: number; parMois: number[]; solde: number } {
  const parMois: number[] = []; let s = solde;
  for (let i = 0; i < n; i++) { const g = interetMensuel(s); parMois.push(g); s += g; }
  return { total: s - solde, parMois, solde: s };
}

/** Montant réellement versé le jour de paie : on ne dépasse jamais l'objectif. */
export const montantAuto = (epargne: number, objectif: number, mensuel: number) => Math.max(0, Math.min(mensuel, objectif - epargne));
export const reste = (epargne: number, objectif: number) => Math.max(0, objectif - epargne);
export const estAtteint = (epargne: number, objectif: number) => objectif > 0 && epargne >= objectif;

/** Mois de versement restants et date d'atteinte : le premier versement tombe à la prochaine paie. */
export function echeance(epargne: number, objectif: number, mensuel: number, prochainePaie: Jour): { mois: number; date: Jour | null } {
  const n = moisPourAtteindre(objectif, epargne, mensuel);
  if (!Number.isFinite(n)) return { mois: Infinity, date: null };
  return { mois: n, date: n === 0 ? null : dateObjectif(prochainePaie, n - 1) };
}

export interface ResultatRetrait {
  ok: boolean; erreur?: string;
  /** Objectif atteint : retrait libre. */
  libre: boolean;
  /** Retrait d'urgence de l'année, sans frais. */
  urgenceGratuite: boolean;
  penalite: number;
  /** Montant crédité sur le solde. */
  net: number;
  avertissement: string | null;
}
/** Retrait : libre une fois l'objectif atteint ; avant, un seul retrait d'urgence sans frais par an, ensuite 2 % de pénalité. */
export function evaluerRetrait(e: { epargne: number; objectif: number; montant: number; urgenceDejaUtilisee: boolean }): ResultatRetrait {
  const base = { libre: false, urgenceGratuite: false, penalite: 0, net: 0, avertissement: null as string | null };
  if (!Number.isFinite(e.montant) || e.montant <= 0) return { ...base, ok: false, erreur: 'Saisissez un montant à retirer.' };
  if (e.montant > e.epargne) return { ...base, ok: false, erreur: "Le montant dépasse l'épargne du coffre." };
  if (estAtteint(e.epargne, e.objectif)) return { ...base, ok: true, libre: true, net: e.montant };
  if (!e.urgenceDejaUtilisee) return { ...base, ok: true, urgenceGratuite: true, net: e.montant, avertissement: "Objectif non atteint : ce retrait d'urgence est gratuit, mais c'est le seul de l'année." };
  const penalite = Math.round(e.montant * TAUX_PENALITE);
  return { ...base, ok: true, penalite, net: e.montant - penalite, avertissement: `Objectif non atteint et retrait d'urgence déjà utilisé cette année : ${Math.round(TAUX_PENALITE * 100)} % de frais.` };
}

export interface SaisieCoffre { nom: string; objectif: number; mensuel: number; partage: boolean; membres: number }
export type ErreursCoffre = Partial<Record<keyof SaisieCoffre, string>>;
export function validerCoffre(s: SaisieCoffre): ErreursCoffre {
  const e: ErreursCoffre = {};
  if (s.nom.trim().length === 0) e.nom = 'Donnez un nom à votre coffre';
  else if (s.nom.trim().length > NOM_MAX) e.nom = `${NOM_MAX} caractères au plus`;
  if (!Number.isFinite(s.objectif) || s.objectif < OBJECTIF_MIN) e.objectif = `Objectif minimum : ${OBJECTIF_MIN.toLocaleString('fr-FR')}`;
  else if (s.objectif > OBJECTIF_MAX) e.objectif = 'Objectif trop élevé';
  if (!Number.isFinite(s.mensuel) || s.mensuel < MENSUEL_MIN) e.mensuel = `Versement minimum : ${MENSUEL_MIN.toLocaleString('fr-FR')}`;
  else if (!e.objectif && s.mensuel > s.objectif) e.mensuel = "Le versement ne peut pas dépasser l'objectif";
  if (s.partage && (!Number.isInteger(s.membres) || s.membres < MEMBRES_MIN || s.membres > MEMBRES_MAX)) e.membres = `Entre ${MEMBRES_MIN} et ${MEMBRES_MAX} membres`;
  return e;
}
/** Ce que le membre verse lui-même chaque mois (sa part si le coffre est partagé). */
export const partDuMembre = (mensuel: number, partage: boolean, membres: number) => (partage ? partParMembre(mensuel, membres) : mensuel);
export const MAX_COFFRES = 8;

/** Contrôle d'un versement exceptionnel ; renvoie le message d'erreur à afficher, ou null si tout va bien. */
export function verifierVersement(c: { epargne: number; objectif: number }, montant: number | null, solde: number): string | null {
  if (montant === null || !Number.isInteger(montant) || montant <= 0) return 'Saisissez un montant en francs.';
  if (estAtteint(c.epargne, c.objectif)) return 'Objectif atteint : ce coffre est complet.';
  const r = reste(c.epargne, c.objectif);
  if (montant > r) return `Il ne manque que ${r.toLocaleString('fr-FR')} pour atteindre l'objectif.`;
  if (montant > solde) return `Solde insuffisant : ${Math.max(0, Math.round(solde)).toLocaleString('fr-FR')} disponibles.`;
  return null;
}
