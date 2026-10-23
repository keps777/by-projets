// Tranche « commerce » : caisse AssureMe (encaissements, QR en cours), ventes de la semaine et avances de stock.
import { app, maintenant, tranche } from '../../data/store.svelte.ts';
import type { ModeEncaissement } from '../../core/commerce.ts';
import { lundiDe } from '../../core/services.ts';
import type { Jour } from '../../core/dates.ts';

export interface Encaissement { id: string; ts: number; montant: number; frais: number; net: number; retenue: number; mode: ModeEncaissement; code: string }
export interface QrEnCours { montant: number; mode: ModeEncaissement; graine: number; expire: number; code: string }
export interface Remboursement { ts: number; montant: number }
export interface Avance {
  id: string; ts: number; montant: number; frais: number; taux: number; journalier: number; semaines: number;
  rembourse: number; remboursements: Remboursement[]; grossiste: string; livraison: number; livre: boolean; creditId: string; statut: 'en_cours' | 'soldee';
}
/** Ventes des 7 jours (lundi = 0) : total et part encaissée via AssureMe. */
export interface Semaine { lundi: Jour; total: number[]; assureMe: number[]; precedente: number }
export interface EtatCommerce {
  nom: string | null; saisie: string; mode: ModeEncaissement; qr: QrEnCours | null;
  encaissements: Encaissement[]; semaine: Semaine; avances: Avance[]; compteurQr: number;
}

function defaut(): EtatCommerce {
  const lundi = lundiDe(maintenant());
  if (app.mode !== 'demo') return { nom: null, saisie: '', mode: 'comptant', qr: null, encaissements: [], avances: [], compteurQr: 1, semaine: { lundi, total: Array(7).fill(0), assureMe: Array(7).fill(0), precedente: 0 } };
  return {
    nom: 'Pharmacie du Rond-Point', saisie: '24500', mode: 'comptant', qr: null, encaissements: [], avances: [], compteurQr: 1,
    semaine: { lundi, total: [150_000, 190_000, 160_000, 210_000, 175_000, 230_000, 125_000], assureMe: [93_000, 117_800, 99_200, 130_200, 108_500, 142_600, 77_500], precedente: 1_050_000 }
  };
}
/** À relire à chaque usage : la tranche est remplacée quand on bascule démo / vierge. */
export const etat = () => tranche<EtatCommerce>('commerce', defaut);
