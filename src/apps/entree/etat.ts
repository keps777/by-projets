// État propre à l'entrée et à « Moi » : préférences de l'appareil, autorisations voulues, fidélité par personne, historique des litiges ouverts.
// Une tranche du magasin (`tranche('entree')`) : persistée avec le monde. À créer dans un script ou une action, jamais dans un `$derived`.
import { app, aujourdhui, maintenant, tranche } from '../../data/store.svelte.ts';
import { ajouterJours, enDate } from '../../core/dates.ts';
import type { Billet } from '../../domain/types.ts';

export type ClePermission = 'camera' | 'position' | 'notifications' | 'contacts' | 'micro';
export const PERMISSIONS: ClePermission[] = ['camera', 'position', 'notifications', 'contacts', 'micro'];
export interface Mouvement { id: string; ts: number; libelle: string; pts: number }
export interface Bon { id: string; ts: number; montant: number; utilise: boolean }
export interface FideliteDe { /** Points gagnés depuis toujours (détermine le palier). */ cumul: number; mouvements: Mouvement[]; /** Billets déjà crédités en points. */ credites: string[]; /** Billets dont les points ont été repris (remboursement). */ repris: string[]; bons: Bon[] }
export interface Preferences {
  theme: 'sombre' | 'clair' | 'auto';
  /** Sons et jingle de bienvenue (désactivé = silencieux). */ sons: boolean;
  economieDonnees: boolean;
  /** Ce qui réveille : retards, colis, bons plans, proches. */ alertes: { retard: boolean; colis: boolean; bonsPlans: boolean; proches: boolean };
  /** Autorisations voulues par la personne (l'app n'utilise pas ce qui est coupé, même si le navigateur l'autorise). */ permissions: Record<ClePermission, boolean>;
  jinglejoue: boolean;
  /** Dernier voyageur connecté sur cet appareil (celui que reconnaissent le visage et la passkey). */ appareilId: string;
  fidelite: Record<string, FideliteDe>;
}
const jourMs = (n: number) => enDate(ajouterJours(aujourdhui(), -n)).getTime();
/** Historique initial de la voyageuse de démo (Aïcha) : les dernières lignes avant le monde simulé. */
export function historiqueInitial(personneId: string): Mouvement[] {
  if (personneId !== 'p-aicha') return [];
  return [
    { id: 'm-init-1', ts: jourMs(16), libelle: 'Billet Douala → Yaoundé', pts: 150 }, { id: 'm-init-2', ts: jourMs(22), libelle: 'Parrainage · Paul', pts: 500 },
    { id: 'm-init-3', ts: jourMs(32), libelle: 'Billet Yaoundé → Bafoussam', pts: 100 }, { id: 'm-init-4', ts: jourMs(44), libelle: 'Réduction utilisée', pts: -500 }
  ];
}
export function defautPreferences(): Preferences {
  return {
    theme: 'sombre', sons: true, economieDonnees: false, alertes: { retard: true, colis: true, bonsPlans: false, proches: true },
    permissions: { camera: true, position: true, notifications: true, contacts: false, micro: true }, jinglejoue: false, appareilId: 'p-aicha', fidelite: {}
  };
}
/** Préférences de l'appareil (créées au premier appel). */
export const preferences = (): Preferences => tranche<Preferences>('entree', defautPreferences);
/** Lecture seule (sans rien créer) : utilisable dans un `$derived`. Vaut `undefined` tant que `fideliteDe` n'a pas été appelée pour cette personne. */
export const fideliteLue = (personneId: string): FideliteDe | undefined => (app.tranches['entree'] as Preferences | undefined)?.fidelite?.[personneId];
/** Fidélité d'une personne. Les billets déjà valides à la création sont comptés comme déjà crédités (ils sont dans le solde de départ). */
export function fideliteDe(personneId: string, pointsDepart: number, billetsExistants: Billet[]): FideliteDe {
  const p = preferences();
  if (!p.fidelite[personneId]) { const mouvements = historiqueInitial(personneId); p.fidelite[personneId] = {
    cumul: Math.max(pointsDepart, 0) + mouvements.filter((m) => m.pts < 0).reduce((s, m) => s - m.pts, 0), mouvements,
    credites: billetsExistants.filter((b) => b.statut === 'valide' || b.statut === 'scanne').map((b) => b.id), repris: [], bons: []
  }; }
  return p.fidelite[personneId];
}
export { maintenant };
