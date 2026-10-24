// État propre à l'application Colis & partenaires (tranches du store) : brouillon d'envoi, courses simulées, boutiques relais, candidatures.
import { app, tranche } from '../../data/store.svelte.ts';
import { pointDepuisGare, QUARTIER_DEFAUT, type Boutique, type TypeBoutique } from '../../core/relais.ts';

// ------------------------------------------------------------------ tranche « colis »
export type Taille = 'S' | 'M' | 'L';
export interface Brouillon { taille: Taille; nom: string; tel: string; moto: boolean; assurance: boolean; cod: boolean; relaisId: string | null; quartier: string }
export const brouillonVide = (): Brouillon => ({ taille: 'M', nom: '', tel: '', moto: false, assurance: true, cod: false, relaisId: null, quartier: QUARTIER_DEFAUT });
/** Suivi simulé d'une course de livraison moto : étape 0 parti du relais, 1 en route, 2 presque là ; 3 = remis (le colis passe à `livre`). */
export interface Course { quartier: string; etape: number; essais: number }
export interface TrancheColis { brouillon: Brouillon; courses: Record<string, Course>; partages: Record<string, number>; livreurs: Record<string, { dispo: boolean }> }
export const trancheColis = () => tranche<TrancheColis>('colis', () => ({ brouillon: brouillonVide(), courses: {}, partages: {}, livreurs: {} }));
/** Lectures sans création (utilisables dans un `$derived`). */
export const relaisDuBrouillon = (): string | null => (app.tranches.colis as TrancheColis | undefined)?.brouillon.relaisId ?? null;
export const courseDe = (colisId: string): Course | undefined => (app.tranches.colis as TrancheColis | undefined)?.courses[colisId];

// ------------------------------------------------------------------ tranche « relais » : fiches des boutiques
const B = (nom: string, type: TypeBoutique, adresse: string, ouverture: number, fermeture: number, h24: boolean, jours: number[], est: number, nord: number): Boutique => ({ nom, type, adresse, ouverture, fermeture, h24, jours, est, nord });
const SEMAINE = [1, 2, 3, 4, 5, 6];
/** Les quatre points relais de la démo (la carte de la maquette), rattachés aux personnes `relais` du monde. */
export const BOUTIQUES_DEFAUT: Record<string, Boutique> = {
  'p-mado': B('Chez Mado', 'Boutique', 'Akwa, rue Joffre', 7, 21, false, SEMAINE, 230, 190),
  'p-relais-port': B('Pharmacie du Port', 'Pharmacie', 'Bonanjo, quai du port', 8, 20, false, SEMAINE, 520, 730),
  'p-relais-bali': B('Station Total Bali', 'Station', 'Bali, carrefour', 0, 24, true, [0, 1, 2, 3, 4, 5, 6], 380, 1350),
  'p-relais-ndom': B('Librairie Ndom', 'Librairie', 'Deïdo, avenue Ndom', 9, 18, false, SEMAINE, 1950, 780)
};
export interface TrancheRelais { boutiques: Record<string, Boutique> }
export const trancheRelais = () => tranche<TrancheRelais>('relais', () => ({ boutiques: Object.fromEntries(Object.entries(BOUTIQUES_DEFAUT).map(([k, v]) => [k, { ...v, jours: [...v.jours] }])) }));
export const boutiqueDe = (personneId: string | undefined | null): Boutique | undefined => (personneId ? (app.tranches.relais as TrancheRelais | undefined)?.boutiques[personneId] ?? BOUTIQUES_DEFAUT[personneId] : undefined);
export const positionDe = (b: Boutique) => pointDepuisGare(b.est, b.nord);

// ------------------------------------------------------------------ tranche « candidatures » : devenir relais ou livreur
export interface FicheRelais { boutique: Omit<Boutique, 'est' | 'nord'>; titulaire: string; moyen: 'momo' | 'om'; tel: string; photos: number; cni: boolean; colisParJour: number }
export interface FicheLivreur { conditions: boolean[]; titulaire: string; tel: string }
export interface Candidature {
  id: string; type: 'relais' | 'livreur'; /** Personne connectée qui candidate. */ candidatId: string; /** Compte partenaire créé (inactif tant que la candidature est en attente). */ personneId: string;
  ts: number; statut: 'attente' | 'acceptee' | 'refusee'; fiche: FicheRelais | FicheLivreur; repondueLe?: number;
}
export interface TrancheCandidatures { liste: Candidature[] }
export const trancheCandidatures = () => tranche<TrancheCandidatures>('candidatures', () => ({ liste: [] }));
export const candidatures = (): Candidature[] => (app.tranches.candidatures as TrancheCandidatures | undefined)?.liste ?? [];
