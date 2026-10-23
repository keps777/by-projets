// Tranche d'état « logement » : simulation, dossier en cours, bail actif (suivi des loyers), preuves de paiement.
import { app, tranche, totalMensualites } from '../../data/store.svelte.ts';
import { niveauDuScore, tauxMensuel, type Decision, type Niveau } from '../../core/credit.ts';
import type { Otp } from '../../core/auth.ts';
import type { Jour } from '../../core/dates.ts';
import type { EntreeSimulation, LoyerSuivi, TypeCompte } from '../../core/avance-loyer.ts';

export const CLE = 'logement';

/** Justificatif importé : seule une miniature (200 px) est gardée. */
export interface Piece { nom: string; taille: number; type: string; miniature: string; ajoute: number }
export interface CompteBailleur { type: TypeCompte; numero: string; telephone: string; titulaire: string; verifie: boolean; otp: Otp | null }
export interface Simulation { loyer: number; mois: number; duree: number }
export interface Dossier {
  statut: 'brouillon' | 'accord_attendu';
  logement: string; bailleur: string; entree: Jour;
  bail: Piece | null; cni: Piece | null; photos: Piece[]; compte: CompteBailleur | null;
  decision: Decision | null; accordDemandeLe: number | null;
}
export interface Bail {
  id: string; libelle: string; bailleur: string; loyer: number; entree: Jour; finBail: Jour; assurance: number;
  /** Premier mois suivi dans le calendrier des loyers. */
  debut: Jour; loyers: LoyerSuivi[];
  /** Le loyer est prélevé sur la paie (bail financé par une avance) ; sinon il est seulement suivi. */
  prelevement: boolean; prochaine: Jour | null;
  /** Loyers garantis par AssureMe pendant un prélèvement reporté, à régulariser à la paie suivante. */
  arrieres: number;
  avanceId: string | null; compteLibelle: string;
  equipement: { ids: string[]; creditId: string; livraison: Jour } | null;
}
export interface Preuve {
  id: string; ts: number; reference: string; montant: number; mois: number; loyer: number; remboursement: number; duree: number;
  bailleur: string; compteLibelle: string; entree: Jour; creditId: string; logement: string; assurance: number;
}
export interface Logement {
  sim: Simulation; dossier: Dossier | null; bail: Bail | null; preuves: Preuve[];
  /** « Projet maison » : coffre terrain (données de démonstration pour Aïcha). */
  projet: { objectif: number; epargne: number; mensuel: number } | null;
}

const defaut = (): Logement => ({
  sim: { loyer: 80_000, mois: 6, duree: 10 }, dossier: null, preuves: [],
  bail: app.mode === 'demo' ? {
    id: 'bail-makepe', libelle: 'Appartement Makepe', bailleur: 'M. Essomba', loyer: 80_000, entree: '2026-05-01', finBail: '2028-08-31', assurance: 2_500,
    debut: '2026-05-01', prelevement: false, prochaine: null, arrieres: 0, avanceId: null, compteLibelle: 'Orange Money ···· 0937', equipement: null,
    loyers: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((mois) => ({ mois, montant: 80_000, statut: 'paye' as const }))
  } : null,
  projet: app.mode === 'demo' ? { objectif: 6_000_000, epargne: 2_400_000, mensuel: 15_000 } : null
});
/** La tranche (créée à la première lecture : à appeler depuis l'initialisation d'un composant ou une action, jamais dans un $derived). */
export const logement = (): Logement => tranche(CLE, defaut);
/** Lecture sans création, sûre partout. */
export const logementLu = (): Logement | undefined => app.tranches[CLE] as Logement | undefined;

export const niveauActuel = (): Niveau => niveauDuScore(app.score.valeur);
export const tauxActuel = (): number => tauxMensuel(app.compte?.pass ?? 'essentiel', niveauActuel());
/** Tout ce dont la simulation a besoin, lu dans l'état de l'application. */
export function entreeSimulation(s: Simulation): EntreeSimulation {
  return { ...s, taux: tauxActuel(), salaire: app.compte?.salaireNet ?? 0, mensualitesExistantes: totalMensualites(), niveau: niveauActuel() };
}
