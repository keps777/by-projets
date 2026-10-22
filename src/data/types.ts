// État commun à toute l'application. Chaque fonctionnalité garde sa propre « tranche » (voir store.svelte.ts → tranche()).
import type { Niveau, Pass } from '../core/credit.ts';
import type { EtatVerrou, Otp } from '../core/auth.ts';
import type { Jour } from '../core/dates.ts';

export interface Compte {
  id: string; prenom: string; nom: string; telephone: string; ville: string; quartier: string;
  employeur: string; salaireNet: number; jourPaie: number; anciennete: string;
  pass: Pass; numeroMembre: string; cree: number;
}
export interface Appareil { id: string; nom: string; lieu: string; quand: number; actuel: boolean; biometrie?: boolean }
export interface Auth {
  /** PBKDF2 du code à 6 chiffres. */ hash: string | null; sel: string | null;
  verrou: EtatVerrou; otp: Otp | null; derniereActivite: number; connecte: boolean;
  biometrie: boolean; idBiometrie: string | null; appareils: Appareil[]; telephoneEnCours: string | null;
}
export interface Mouvement { id: string; ts: number; titre: string; sous: string; montant: number; ini: string; categorie: string }
export interface Notification { id: string; ts: number; titre: string; sous: string; lu: boolean; lien?: string }
export interface Credit { id: string; produit: 'ecole' | 'logement' | 'auto' | 'solaire' | 'commerce' | 'sante'; libelle: string; capital: number; mensualite: number; duree: number; payees: number; prochaine: Jour; statut: 'actif' | 'termine' | 'reporte' }
export interface Score { valeur: number; historique: { mois: string; valeur: number }[]; conseilsFaits: string[]; signaux: Record<string, number> }

export interface Etat {
  version: 1;
  mode: 'demo' | 'vierge';
  compte: Compte | null;
  auth: Auth;
  solde: number;
  mouvements: Mouvement[];
  notifications: Notification[];
  credits: Credit[];
  score: Score;
  /** Dernière paie traitée (le moteur de paie rattrape les paies manquées). */
  dernierePaie: Jour | null;
  /** Tranches propres à chaque fonctionnalité (santé, école, coffres…), initialisées à la demande. */
  tranches: Record<string, unknown>;
}
export type { Niveau, Pass, Jour };
