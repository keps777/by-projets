// État propre aux applications de terrain (quai, chauffeur, convoyeur, contrôleur, conducteur, vendeur), en deux tranches du magasin :
//  « terrain »   : passages au quai, suivi des départs en route, contrôles, remises ;
//  « convoyeur » : bascule hors ligne et file des ventes en attente de synchronisation (voir convoyeur.ts).
import { app, tranche } from '../../data/store.svelte.ts';
import type { StatutScan } from '../../domain/actions.ts';

export interface Passage {
  id: string; ts: number; departId: string; agentId: string; statut: StatutScan; billetId?: string; code: string; message: string; via: 'qr' | 'code' | 'liste';
  /** Heure à laquelle le superviseur a été appelé pour ce refus. */ superviseurAppele?: number; refuse?: boolean; identite?: 'ok' | 'non';
}
export interface Incident { id: string; ts: number; type: string; note: string; arret: string }
export type Etape = 'quai' | 'route' | 'arret' | 'termine';
export interface SuiviDepart {
  /** Indice du prochain arrêt (ou de l'arrêt courant si `etape` = « arret »). */ k: number; etape: Etape; vitesse: number; vitesseAlertee: boolean; departA?: number; arriveeArretA?: number;
  checklist: Record<string, boolean>; descendus: string[]; montes: string[]; incidents: Incident[];
}
export interface SansBillet { id: string; ts: number; nom: string; tel: string; billetId?: string; amende: number; geste: boolean; prix: number; moyen: string }
export interface ControleDepart { comptes: number; controles: Record<string, number>; sansBillet: SansBillet[]; rapportA?: number; litigeA?: number }
export interface Terrain {
  quai: { departId: string | null; radar: boolean }; passages: Passage[]; suivis: Record<string, SuiviDepart>;
  /** Arrêt de montée des billets vendus en route (billet → indice d'arrêt). */ montees: Record<string, number>;
  controles: Record<string, ControleDepart>; chauffeurDepartId: string | null; controleDepartId: string | null;
  covoit: { verses: Record<string, { montant: number; ts: number }>; offreId: string | null };
  remises: { agentId: string; jour: string; montant: number; ts: number }[];
}
export interface VenteFile { id: string; departId: string; agentId: string; arret: number; prix: number; moyen: 'especes' | 'momo'; nom: string; tel: string; ts: number; code: string; etat: 'file' | 'echec'; erreur?: string }
export interface DerniereVente { code: string; tel: string; nom: string; prix: number; moyen: 'especes' | 'momo'; arret: string; ts: number; enFile: boolean }
export interface Convoyeur { horsLigne: boolean; file: VenteFile[]; arret: number | null; derniere: DerniereVente | null; derniereSync: number | null }

export const defautTerrain = (): Terrain => ({ quai: { departId: null, radar: true }, passages: [], suivis: {}, montees: {}, controles: {}, chauffeurDepartId: null, controleDepartId: null, covoit: { verses: {}, offreId: null }, remises: [] });
export const defautConvoyeur = (): Convoyeur => ({ horsLigne: false, file: [], arret: null, derniere: null, derniereSync: null });
/** À utiliser dans les actions et au démarrage : crée la tranche si besoin. */
export const terrain = (): Terrain => tranche<Terrain>('terrain', defautTerrain);
export const convoyeurEtat = (): Convoyeur => tranche<Convoyeur>('convoyeur', defautConvoyeur);
/** Lecture sans création (sûre dans un `$derived`). */
export const lireTerrain = (): Terrain => (app.tranches.terrain as Terrain | undefined) ?? defautTerrain();
export const lireConvoyeur = (): Convoyeur => (app.tranches.convoyeur as Convoyeur | undefined) ?? defautConvoyeur();

export const suiviVide = (): SuiviDepart => ({ k: 1, etape: 'quai', vitesse: 0, vitesseAlertee: false, checklist: {}, descendus: [], montes: [], incidents: [] });
export function suiviDe(departId: string): SuiviDepart { const t = terrain(); return (t.suivis[departId] ??= suiviVide()); }
export const lireSuivi = (departId: string): SuiviDepart => lireTerrain().suivis[departId] ?? suiviVide();
export function controleDe(departId: string): ControleDepart { const t = terrain(); return (t.controles[departId] ??= { comptes: 0, controles: {}, sansBillet: [] }); }
export const lireControle = (departId: string): ControleDepart => lireTerrain().controles[departId] ?? { comptes: 0, controles: {}, sansBillet: [] };
