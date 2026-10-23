// Tranche « paiements » : factures à régler, reçus, paiement en cours et reports de prélèvement.
import { app, tranche } from '../../data/store.svelte.ts';
import { jourDe, type Jour } from '../../core/dates.ts';
import type { LigneRecu, ModeReglement, Recu } from '../../core/recu.ts';

export interface FacturePay {
  id: string; partenaire: string; code: string; ini: string; lieu: string; categorie: string; beneficiaire: string;
  emis: number; echeance: Jour; lignes: (LigneRecu & { sous: string; note: string })[];
  /** `a_payer` ; `payee` ; `etalee` (la clinique est réglée, le membre rembourse sur salaire). */
  statut: 'a_payer' | 'payee' | 'etalee'; ref?: string;
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

/** Facture de démonstration d'Aïcha : Clinique Les Palmiers, 35 500 dont 7 100 à sa charge, à payer avant le 25 oct. */
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
  factures: app.mode === 'demo' ? [FACTURE_PALMIERS()] : [], recus: [], enCours: null, reports: {},
  plafondSanteUtilise: app.mode === 'demo' ? PLAFOND_DEMO_AVANT : 0, derniereConfirmation: 0
});
/** Tranche en écriture : la crée à la première demande. À n'appeler que depuis une action (jamais dans un `$derived` ni un gabarit). */
export const paiements = (): Paiements => tranche<Paiements>('paiements', defaut);
/** Tranche en lecture seule : ne crée rien (sûr dans un `$derived`) ; renvoie la valeur par défaut tant que la tranche n'existe pas. */
export const lirePaiements = (): Paiements => (app.tranches.paiements as Paiements | undefined) ?? defaut();

const texte = (v: unknown, defaut = ''): string => (typeof v === 'string' && v.trim() ? v : defaut);
const nombre = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/**
 * Lecture tolérante des factures émises par la tranche 'sante' (portail hôpital), en lecture seule.
 * Champs reconnus : id, etablissement|partenaire|clinique, emis|ts, echeance (AAAA-MM-JJ), statut, lignes[{nom|libelle, sous, montant, note}].
 * Une facture inexploitable (sans id, sans ligne chiffrée) est ignorée.
 */
export function facturesDeSante(brut: unknown): FacturePay[] {
  const liste = (brut as { factures?: unknown } | null | undefined)?.factures;
  if (!Array.isArray(liste)) return [];
  const res: FacturePay[] = [];
  for (const f of liste as Record<string, unknown>[]) {
    if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !Array.isArray(f.lignes)) continue;
    const lignes = (f.lignes as Record<string, unknown>[]).map((l) => ({ nom: texte(l?.nom ?? l?.libelle, 'Prestation'), sous: texte(l?.sous), montant: nombre(l?.montant), note: texte(l?.note) })).filter((l) => l.montant > 0);
    if (!lignes.length) continue;
    const nom = texte(f.etablissement ?? f.partenaire ?? f.clinique, 'Établissement de santé');
    const statut = texte(f.statut, 'a_payer');
    if (!['a_payer', 'emise', 'emis', 'en_attente'].includes(statut)) continue;
    res.push({
      id: f.id, partenaire: nom, code: texte(f.code), ini: nom.split(/\s+/).map((m) => m[0]).join('').slice(0, 2).toUpperCase(), lieu: texte(f.lieu), categorie: 'sante',
      beneficiaire: texte(f.beneficiaire ?? f.patient), emis: nombre(f.emis ?? f.ts) || Date.now(), echeance: texte(f.echeance, jourDe(new Date(Date.now() + 7 * 86_400_000))), lignes, statut: 'a_payer'
    });
  }
  return res;
}
/** Toutes les factures connues : les nôtres (qui l'emportent à identifiant égal), puis celles de la santé. */
export function toutesFactures(): FacturePay[] {
  const miennes = lirePaiements().factures;
  const sante = 'sante' in app.tranches ? facturesDeSante(app.tranches.sante).filter((f) => !miennes.some((m) => m.id === f.id)) : [];
  return [...miennes, ...sante];
}
export const facturesAPayer = () => toutesFactures().filter((f) => f.statut === 'a_payer');
export const factureParId = (id: string | null) => (id ? toutesFactures().find((f) => f.id === id) : undefined);
export const jourCourant = (now: number) => jourDe(new Date(now));
