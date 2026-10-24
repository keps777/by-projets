// Tranches d'état du patron : tout ce qui n'appartient à aucune entité du monde (dossiers de financement, conventions, questions posées, historique).
// Règle du socle : on ne crée jamais une tranche dans un `$derived` ; `demarrage.ts` les crée au lancement et chaque action les relit avec `tranche()`.
import { ajouterMois, type Jour } from '../../core/dates.ts';
import type { ColisPartenaire, Convention } from '../../core/interagences.ts';
import type { Periode } from '../../core/indicateurs.ts';
import { aujourdhui, tranche } from '../../data/store.svelte.ts';

export interface Dossier {
  id: string; offreId: string; montant: number; duree: number; apport: number; finance: number; mensualite: number; creeLe: number;
  /** Étape en cours (0 = dossier envoyé … 4 = fonds versés). */ etape: number; /** Horodatage d'entrée dans chaque étape. */ horodatage: (number | null)[]; pieces: Record<string, boolean>;
}
export interface EtatFinancement { selection: string; montant: number; duree: number; dossiers: Dossier[] }
export interface EtatInterAgences { conventions: Convention[]; liens: ColisPartenaire[] }
export interface EtatAssistant { questions: { q: string; ts: number }[] }
export interface EtatPatron { vue: 'gares' | 'personnes'; periode: Periode; historique?: { jour: Jour; billets: number } }

export const etatPatron = () => tranche<EtatPatron>('patron', () => ({ vue: 'gares', periode: 'jour' }));
export const etatAssistant = () => tranche<EtatAssistant>('assistant', () => ({ questions: [] }));
export const etatFinancement = () => tranche<EtatFinancement>('financement', () => ({ selection: 'bus-70', montant: 38_000_000, duree: 36, dossiers: [] }));
/** Conventions de départ : Alpha VIP attend la signature de Bêta (brouillon), Touristique a demandé une convention. */
export const etatInterAgences = () => tranche<EtatInterAgences>('interAgences', () => {
  const renouvellement = ajouterMois(aujourdhui(), 12);
  return { conventions: [{ partenaireId: 'AV', partBetaPct: 60, statut: 'brouillon', duree: 12, renouvellement }, { partenaireId: 'TR', partBetaPct: 50, statut: 'demandee', duree: 12, renouvellement }], liens: [] };
});
