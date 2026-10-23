// Tranche « paiements » : factures à régler, reçus, paiement en cours et reports de prélèvement.
import { app, tranche } from '../../data/store.svelte.ts';
import { jourDe, type Jour } from '../../core/dates.ts';
import type { LigneRecu, ModeReglement, Recu } from '../../core/recu-paiement.ts';
import type { Repartition } from '../../core/sante.ts';
import { repartirActes } from '../../core/sante-facture.ts';
import { LIEUX } from '../sante/reseau.ts';
import { couvertureDe, sante } from '../sante/etat.ts';

export interface FacturePay {
  id: string; partenaire: string; code: string; ini: string; lieu: string; categorie: string; beneficiaire: string;
  emis: number; echeance: Jour; lignes: (LigneRecu & { sous: string; note: string })[];
  /** `a_payer` ; `payee` ; `etalee` (la clinique est réglée, le membre rembourse sur salaire). */
  statut: 'a_payer' | 'payee' | 'etalee'; ref?: string;
  /** `sante` : facture de la tranche santé (clinique partenaire), dont la répartition tiers payant est celle de la facture. */
  origine?: 'sante'; repartition?: Repartition;
}
/** Paiement préparé sur l'écran facture / scan, confirmé sur l'écran suivant. */
export interface Brouillon {
  type: 'facture' | 'libre' | 'envoi'; factureId?: string; code?: string; partenaire: string; ini: string; categorie: string; lieu: string;
  montant: number; mode: ModeReglement; contact?: string;
}
export interface Paiements {
  factures: FacturePay[]; recus: Recu[]; enCours: Brouillon | null;
  /** Dernier report par identifiant de prélèvement : jour de la paie reportée. */
  reports: Record<string, Jour>;
  /** Part du plafond santé annuel déjà consommée par AssureMe. */
  plafondSanteUtilise: number;
  /** Dernière confirmation de code ou biométrie (ms), pour ne pas redemander dans la minute. */
  derniereConfirmation: number;
}

/**
 * Facture « propre » aux paiements (hors santé) : modèle conservé pour les tests et pour de futurs partenaires.
 * En démo, la facture des Palmiers vit dans la tranche santé (f-1190) : une seule facture pour les deux écrans.
 */
export const FACTURE_PALMIERS = (): FacturePay => ({
  id: 'f-palmiers', partenaire: 'Clinique Les Palmiers', code: 'CLP-0425', ini: 'CL', lieu: 'Bonamoussadi, Douala', categorie: 'sante', beneficiaire: 'Lisa Ngono (8 ans)',
  emis: new Date(2026, 9, 21, 9, 42).getTime(), echeance: '2026-10-25',
  lignes: [
    { nom: 'Consultation pédiatrie', sous: 'Lisa · Dr Mbarga', montant: 15_000, note: 'Acte médical codifié CS-02. Tarif conventionné avec la clinique.' },
    { nom: 'Analyses sanguines', sous: 'NFS, CRP', montant: 12_000, note: "Laboratoire interne. Résultats envoyés dans l'app sous 2 h." },
    { nom: 'Médicaments', sous: 'Pharmacie interne · 3 lignes', montant: 8500, note: 'Paracétamol, sirop, vitamine D. Génériques du réseau.' }
  ],
  statut: 'a_payer'
});
/** Plafond santé déjà consommé dans la démo : 214 400 après la facture des Palmiers (28 400), soit 186 000 avant. */
export const PLAFOND_DEMO_AVANT = 186_000;

const defaut = (): Paiements => ({
  factures: [], recus: [], enCours: null, reports: {},
  plafondSanteUtilise: app.mode === 'demo' ? PLAFOND_DEMO_AVANT : 0, derniereConfirmation: 0
});
/** Tranche en écriture : la crée à la première demande. À n'appeler que depuis une action (jamais dans un `$derived` ni un gabarit). */
export const paiements = (): Paiements => tranche<Paiements>('paiements', defaut);
/** Tranche en lecture seule : ne crée rien (sûr dans un `$derived`) ; renvoie la valeur par défaut tant que la tranche n'existe pas. */
export const lirePaiements = (): Paiements => (app.tranches.paiements as Paiements | undefined) ?? defaut();

/** Initiales d'un établissement : « Clinique Les Palmiers » → « CL ». */
const initialesDe = (nom: string) => nom.split(/\s+/).map((m) => m[0]).join('').slice(0, 2).toUpperCase();
/**
 * Factures de la tranche santé (émises par le portail de la clinique, ou données d'exemple de la démo), vues comme des factures à payer.
 * La santé reste la source de vérité : le montant à la charge du membre est celui de la facture (pas recalculé), et le paiement
 * met la facture santé à jour (voir `executerPaiement`). `toutes` : inclut aussi les factures déjà réglées ou étalées.
 */
export function facturesDeSante(toutes = false): FacturePay[] {
  const c = app.compte, couverture = couvertureDe();
  if (!c || !couverture) return [];
  const recus = lirePaiements().recus;
  return sante().factures
    .filter((f) => f.numeroMembre === c.numeroMembre && f.statut !== 'brouillon' && (toutes || f.statut === 'a_regler'))
    .map((f): FacturePay => {
      const lieu = LIEUX.find((l) => l.id === f.etablissementId);
      return {
        id: f.id, partenaire: f.etablissement, code: f.numero, ini: initialesDe(f.etablissement), lieu: lieu ? `${lieu.quartier}, Douala` : 'Douala', categorie: 'sante', beneficiaire: f.patient,
        emis: Date.parse(f.date + 'T09:42:00'), echeance: f.echeance, origine: 'sante',
        lignes: f.lignes.map((l) => ({ nom: l.nom, sous: l.sous, montant: l.montant, note: '' })),
        repartition: repartirActes(f.lignes, couverture, f.assureMe),
        statut: f.statut === 'a_regler' ? 'a_payer' : f.statut === 'etalee' ? 'etalee' : 'payee',
        ref: recus.find((r) => r.factureId === f.id)?.ref
      };
    });
}
/** Toutes les factures connues : les nôtres (hors santé), puis celles de la santé. */
export function toutesFactures(): FacturePay[] {
  return [...lirePaiements().factures, ...facturesDeSante(true)];
}
export const facturesAPayer = () => toutesFactures().filter((f) => f.statut === 'a_payer');
export const factureParId = (id: string | null) => (id ? toutesFactures().find((f) => f.id === id) : undefined);
export const jourCourant = (now: number) => jourDe(new Date(now));
