// État propre à la tranche « route » : cagnotte, gestes commerciaux, courses, montées en route, options de covoiturage.
import { app, tranche } from '../../data/store.svelte.ts';
import type { Mode, EtapeCourse, MoyenCourse } from '../../core/course.ts';
import type { AvisCovoit, ProfilConducteur } from '../../core/covoitTypes.ts';

export type ChoixRetard = 'attendre' | 'changer' | 'rembourser';
export interface GesteRetard { billetId: string; departId: string; montant: number; choix: ChoixRetard; ts: number }
export interface CourseVoyage {
  id: string; personneId: string; mode: Mode; quartier: string; km: number; gare: string; departId: string; prix: number; moyen: MoyenCourse;
  etape: EtapeCourse; statut: 'en_cours' | 'terminee' | 'annulee'; creeLe: number; majLe: number;
  /** Arrivée annoncée du véhicule (min) d'après la flotte simulée au moment de la commande. */ attente?: number; /** Conducteur le plus proche à la commande. */ conducteur?: string;
  /** Commission AfriMove (10 %). `retenue` sur le paiement (MoMo, Orange Money, cagnotte) ; `due` : espèces, prélevée sur le compte du conducteur. */ commission?: number; commissionMode?: 'retenue' | 'due';
}
/** Commission d'une course payée en espèces : AfriMove la prélève sur le compte du conducteur, qui a encaissé tout le prix. */
export interface CommissionDue { id: string; courseId: string; conducteur: string; montant: number; prixCourse: number; ts: number; majLe: number; statut: 'due' | 'prelevee' | 'annulee' }
export interface MonteeEnRoute { billetId: string; departId: string; arretId: string; arret: string; heure: string; prix: number; ts: number }
export interface OptionsCovoit { femmes: boolean; bagages: boolean; arrets: boolean; fumeur?: boolean; clim?: boolean }
export interface Versement { offreId: string; personneId: string; montant: number; ts: number }
export interface AlerteCovoit { offreId: string; personneId: string; ts: number; type: 'sos' | 'partage' }
export interface SignalementCovoit { id: string; offreId: string; auteurId: string; motif: string; texte: string; ts: number }
export interface AnnulationCovoit { offreId: string; voyageurId: string; paiementId: string; rembourse: number; frais: number; ts: number }
export interface MotoRencontre { mode: 'moto' | 'taxi'; prix: number; point: string; ts: number }
export type ModeCovoit = 'voyageur' | 'conducteur';
export interface EtatRoute {
  /** Cagnotte AfriMove par personne (FCFA) : gestes commerciaux, reversements. */ cagnotte: Record<string, number>;
  /** Gestes commerciaux de retard, par billet (un seul par billet). */ gestes: Record<string, GesteRetard>;
  courses: CourseVoyage[]; /** Montées en route, par billet. */ montees: Record<string, MonteeEnRoute>;
  optionsCovoit: Record<string, OptionsCovoit>; versements: Versement[];
  /** Commissions AfriMove dues par les conducteurs pour les courses payées en espèces. */ commissionsDues: CommissionDue[];
  /** Profil conducteur (identité, permis, véhicule) par personne. */ conducteurs: Record<string, ProfilConducteur>;
  /** Onglet Covoiturage : le panneau choisi par chaque personne (mémorisé). */ modesCovoit: Record<string, ModeCovoit>; avisCovoit: AvisCovoit[];
  /** Passagers montés (code de prise en charge vérifié), par offre. */ montesCovoit: Record<string, string[]>;
  /** Partages de trajet en direct actifs : « offre:personne » → début. */ partagesCovoit: Record<string, number>; alertesCovoit: AlerteCovoit[];
  signalementsCovoit: SignalementCovoit[]; annulationsCovoit: AnnulationCovoit[]; /** Moto-taxi commandée vers le point de rencontre, « offre:personne ». */ motosCovoit: Record<string, MotoRencontre>;
  /** Trajets d'une même série récurrente : offre → identifiant de série. */ seriesCovoit: Record<string, string>;
}
const defaut = (): EtatRoute => ({ cagnotte: {}, gestes: {}, courses: [], montees: {}, optionsCovoit: {}, versements: [], commissionsDues: [], conducteurs: {}, modesCovoit: {}, avisCovoit: [], montesCovoit: {}, partagesCovoit: {}, alertesCovoit: [], signalementsCovoit: [], annulationsCovoit: [], motosCovoit: {}, seriesCovoit: {} });
const VIDE: EtatRoute = Object.freeze(defaut()) as EtatRoute;

/** Tranche en écriture : à appeler depuis une action ou un script, jamais depuis un `$derived`. Complète les champs absents (ancienne sauvegarde). */
export function etat(): EtatRoute {
  const e = tranche<EtatRoute>('route', defaut);
  for (const [k, v] of Object.entries(defaut())) if (!(k in e)) (e as unknown as Record<string, unknown>)[k] = v;
  return e;
}
/** Tranche en lecture seule : sans création, utilisable dans un `$derived`. */
export const lire = (): EtatRoute => ({ ...VIDE, ...((app.tranches.route as Partial<EtatRoute> | undefined) ?? {}) });
export const cagnotteDe = (personneId: string | null | undefined) => (personneId ? lire().cagnotte[personneId] ?? 0 : 0);
