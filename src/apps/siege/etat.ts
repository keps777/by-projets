// État propre au siège (tranche « siege » du magasin) : relevé opérateur simulé, décisions de rapprochement, clôture, réglages.
import type { Jour } from '../../core/dates.ts';
import type { TxOperateur } from '../../core/rapprochement.ts';
import { app, tranche } from '../../data/store.svelte.ts';

export interface Decision { type: 'associe' | 'rembourse'; ts: number; par?: string; billetId?: string; paiementId?: string }
export interface EtatSiege {
  /** Les données de démonstration du siège (relevé MTN/OM, paiements à rapprocher, journal) ont été ajoutées au monde. */
  demoInjectee: boolean;
  /** Transactions du relevé de l'opérateur qui n'ont pas (ou pas encore) de paiement AfriMove en face. */
  releveExterne: TxOperateur[];
  decisions: Record<string, Decision>;
  /** Étapes de clôture mensuelle par mois (AAAA-MM). */
  cloture: Record<string, boolean[]>;
  /** Entretiens planifiés : bus → jour. */
  entretiens: Record<string, Jour>;
  /** Permissions modifiées par rôle (écart avec les valeurs par défaut). */
  permissions: Record<string, Record<string, boolean>>;
  /** PIN gardés de côté pendant la suspension d'un compte. */
  pinsSuspendus: Record<string, string>;
  /** Départs annulés par la suspension d'une ligne : ligne → départs. */
  suspendus: Record<string, string[]>;
  /** Options de ligne non portées par le modèle : jours de circulation (lundi = 0), arrêts vendables, colis en soute. */
  optionsLignes: Record<string, OptionsLigne>;
  /** Départs annulés parce que leur jour de la semaine est décoché : ligne → départs. */
  fermesParJours: Record<string, string[]>;
  omRelancee: boolean;
  /** Début de l'incident Orange Money simulé et, une fois relancée, heure de la relance (ms). */
  incidentDepuis: number; relanceeA: number;
}
export interface OptionsLigne { jours: boolean[]; arrets: boolean; colis: boolean }
export const optionsParDefaut = (): OptionsLigne => ({ jours: Array(7).fill(true), arrets: true, colis: true });
export const etatParDefaut = (): EtatSiege => ({ demoInjectee: false, releveExterne: [], decisions: {}, cloture: {}, entretiens: {}, permissions: {}, pinsSuspendus: {}, suspendus: {}, optionsLignes: {}, fermesParJours: {}, omRelancee: false, incidentDepuis: 0, relanceeA: 0 });
const VIDE: EtatSiege = Object.freeze(etatParDefaut()) as EtatSiege;
/** Pour écrire (action, gestionnaire d'événement) : crée la tranche si besoin. */
export const etatSiege = (): EtatSiege => tranche('siege', etatParDefaut);
/** Pour lire dans un `$derived` : ne crée rien. */
export const lireSiege = (): EtatSiege => (app.tranches.siege as EtatSiege | undefined) ?? VIDE;
