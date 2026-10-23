// Tranche « diaspora » : proches, factures à régler, paiements en euros et leurs reçus.
import { app, tranche } from '../../data/store.svelte.ts';
import type { MoyenPaiement } from '../../core/diaspora.ts';

export type CategorieFacture = 'sante' | 'loyer' | 'ecole' | 'autre';
export interface Facture { id: string; prestataire: string; detail: string; montant: number; categorie: CategorieFacture; signataire?: string; payee: boolean }
export interface Proche { id: string; nom: string; ville: string; pass: string | null; /** Plafond santé annuel du proche (FCFA), s'il en a un. */ plafondSante: number | null; consommeSante: number; factures: Facture[] }
export interface LignePaiement { factureId: string; prestataire: string; detail: string; montant: number; categorie: CategorieFacture; recu: string; signataire: string }
export interface PaiementDiaspora {
  id: string; procheId: string; procheNom: string; procheVille: string; moyen: MoyenPaiement; depuis: string;
  debut: number; delaiSigne: number; montantFcfa: number; lignes: LignePaiement[]; signe: boolean;
}
export interface EtatDiaspora {
  /** Ville depuis laquelle le membre paie. */ depuis: string;
  proches: Proche[]; paiements: PaiementDiaspora[];
  /** Euros déjà envoyés avant l'ouverture de l'historique (compte démo). */ avantEuro: number;
  compteurRecu: number;
}

const facture = (id: string, prestataire: string, detail: string, montant: number, categorie: CategorieFacture, signataire?: string): Facture => ({ id, prestataire, detail, montant, categorie, signataire, payee: false });

function defaut(): EtatDiaspora {
  if (app.mode !== 'demo') return { depuis: 'Paris', proches: [], paiements: [], avantEuro: 0, compteurRecu: 1000 };
  return {
    depuis: 'Paris', avantEuro: 1185.88, compteurRecu: 1186, paiements: [],
    proches: [
      { id: 'p-maman', nom: 'Maman', ville: 'Douala', pass: 'Pass Famille', plafondSante: 400_000, consommeSante: 0, factures: [
        facture('f-clinique', 'Clinique Les Palmiers', 'Consultation + analyses · part restante', 35_500, 'sante', 'Dr Mbarga'),
        facture('f-loyer', 'Bailleur Essomba', 'Loyer de novembre · garanti le 1er', 60_000, 'loyer'),
        facture('f-pharma', 'Pharmacie du Rond-Point', 'Ordonnance du 19 oct.', 8_200, 'sante', 'le pharmacien') ] },
      { id: 'p-paul', nom: 'Frère Paul', ville: 'Yaoundé', pass: 'Pass Essentiel', plafondSante: null, consommeSante: 0, factures: [
        facture('f-ecole', 'Collège de la Retraite', 'Scolarité Noah · T2', 150_000, 'ecole'),
        facture('f-kit', 'Kit solaire AssureMe', 'Mensualité · mois 7 / 24', 9_500, 'autre'),
        facture('f-eneo', 'ENEO', 'Facture d\'octobre · 2 relances', 14_300, 'autre') ] }
    ]
  };
}
/** À relire à chaque usage : la tranche est remplacée quand on bascule démo / vierge. */
export const etat = () => tranche<EtatDiaspora>('diaspora', defaut);
