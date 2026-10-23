// Tranche d'état « sante » : partagée entre l'app du membre (/sante) et le portail de la clinique (/portail/hopital).
import { ajouterJours, jourDe, type Jour } from '../../core/dates.ts';
import { COUVERTURES, type Couverture } from '../../core/sante.ts';
import { echeanceDefaut, repartirActes, type LigneActe } from '../../core/sante-facture.ts';
import { app, maintenant, tranche } from '../../data/store.svelte.ts';
import { enSuivi } from './suivi.svelte.ts';

export const CLINIQUE = { id: 'palmiers', nom: 'Clinique Les Palmiers' } as const;
export type StatutFacture = 'brouillon' | 'a_regler' | 'payee' | 'etalee';
export interface PaiementFacture { ts: number; mode: 'comptant' | 'etale'; aTemps: boolean; mensualite?: number; mois?: number; creditId?: string }
export interface FactureSante {
  id: string; numero: string; source: 'clinique' | 'tele';
  etablissementId: string; etablissement: string;
  /** Membre propriétaire de la carte, et bénéficiaire soigné. */
  numeroMembre: string; patient: string; medecin: string; acte: string;
  date: Jour; echeance: Jour; lignes: LigneActe[];
  total: number; assureMe: number; partPatient: number; plafondDepasse: boolean;
  statut: StatutFacture; paiement?: PaiementFacture;
}
export interface Ordonnance {
  id: string; ts: number; numeroMembre: string; beneficiaire: string; pharmacieId: string; pharmacie: string;
  medicaments: string; livraison: boolean; fraisLivraison: number; photo?: string; annulee?: boolean; partPatient?: number;
}
export interface EtatSante {
  /** Plafond déjà consommé avant les factures suivies ici (année en cours). */
  plafondInitial: number;
  /** Bénéficiaires en plus du titulaire (prénoms). */
  beneficiaires: string[];
  factures: FactureSante[]; ordonnances: Ordonnance[]; sequence: number;
}

export const JOURS_PLAFOND = 365;
export const aujourdhui = (): Jour => jourDe(new Date(maintenant()));
export const numeroFacture = (n: number, date: Jour) => `F-${date.slice(0, 4)}-${n}`;

function lignes3(): LigneActe[] {
  return [
    { nom: 'Consultation pédiatrie', sous: 'Lisa · Dr Mbarga', montant: 15_000, categorie: 'consultation' },
    { nom: 'Analyses sanguines', sous: 'NFS, CRP', montant: 12_000, categorie: 'examen' },
    { nom: 'Médicaments', sous: 'Pharmacie interne · 3 lignes', montant: 8_500, categorie: 'medicament' }
  ];
}
function facture(id: string, n: number, over: Partial<FactureSante> & Pick<FactureSante, 'patient' | 'acte' | 'date' | 'lignes' | 'statut'>, c: Couverture, plafondRestant: number): FactureSante {
  const r = repartirActes(over.lignes, c, plafondRestant);
  return {
    id, numero: numeroFacture(n, over.date), source: 'clinique', etablissementId: CLINIQUE.id, etablissement: CLINIQUE.nom, numeroMembre: 'AM4821', medecin: 'Dr Mbarga',
    echeance: echeanceDefaut(over.date), total: r.total, assureMe: r.assureMe, partPatient: r.patient, plafondDepasse: r.plafondDepasse, ...over
  };
}
/** Données d'exemple : Aïcha (AM4821), Pass Famille, 186 000 déjà utilisés ; Clinique Les Palmiers, 7 100 de part patient sur 35 500. */
export function exemple(now = maintenant()): EtatSante {
  const j = (n: number) => jourDe(new Date(now - n * 86_400_000)), c = COUVERTURES.famille, grand = 10_000_000;
  const paye = (n: number, jours: number): PaiementFacture => ({ ts: now - (jours - n) * 86_400_000, mode: 'comptant', aTemps: true });
  const factures: FactureSante[] = [
    facture('f-1190', 1190, { patient: 'Lisa Ndiba', acte: 'Consultation pédiatrie', date: j(1), echeance: ajouterJours(j(1), 4), lignes: lignes3(), statut: 'a_regler' }, c, 1_014_000),
    facture('f-1131', 1131, { patient: 'Lisa Ndiba', acte: 'Consultation pédiatrie', date: j(27), lignes: [{ nom: 'Consultation pédiatrie', sous: 'Dr Mbarga', montant: 15_000, categorie: 'consultation' }], statut: 'payee', paiement: paye(2, 27) }, c, grand),
    facture('f-1062', 1062, { patient: 'Paul Ndiba', acte: 'Analyses', etablissementId: 'bioplus', etablissement: 'Laboratoire Bio-Plus', medecin: 'Dr Essomba', date: j(40), lignes: [{ nom: 'Bilan sanguin complet', sous: 'Laboratoire Bio-Plus', montant: 27_500, categorie: 'examen' }], statut: 'payee', paiement: paye(1, 40) }, c, grand),
    facture('f-1179', 1179, { numeroMembre: 'AM9051', patient: 'Martine Eyenga', acte: 'Accouchement', medecin: 'Dr Ewane', date: j(14), lignes: [{ nom: 'Accouchement', sous: 'Maternité', montant: 280_000, categorie: 'hospitalisation' }], statut: 'payee', paiement: paye(6, 14) }, c, grand),
    facture('f-1172', 1172, { numeroMembre: 'AM7312', patient: 'Samuel Abena', acte: 'Radiographie', medecin: 'Dr Tchoumi', date: j(15), lignes: [{ nom: 'Radiographie thoracique', sous: 'Imagerie', montant: 36_000, categorie: 'examen' }], statut: 'a_regler' }, c, grand)
  ];
  return { plafondInitial: 152_000, beneficiaires: ['Paul', 'Lisa', 'Junior'], factures, ordonnances: [
    { id: 'o-1', ts: now - 86_400_000 - 3_600_000 * 4, numeroMembre: 'AM4821', beneficiaire: 'Aïcha', pharmacieId: 'rond-point', pharmacie: 'Pharmacie du Rond-Point', medicaments: 'Amoxicilline 500 mg, paracétamol 1 g', livraison: true, fraisLivraison: 1000, partPatient: 7100 }
  ], sequence: 1191 };
}
const vide = (): EtatSante => ({ plafondInitial: 0, beneficiaires: [], factures: [], ordonnances: [], sequence: 1001 });

const defaut = (): EtatSante => (app.mode === 'demo' ? exemple() : vide());
let attente: { pour: object; etat: EtatSante } | null = null;
/**
 * La tranche santé (créée à la première lecture : exemple en démo, vide pour un vrai compte).
 * Lue depuis un `$derived` (où Svelte interdit d'écrire dans l'état), elle est créée juste après, dans une micro-tâche.
 */
export function sante(): EtatSante {
  if ('sante' in app.tranches) return app.tranches.sante as EtatSante;
  if (!enSuivi()) return tranche<EtatSante>('sante', defaut);
  if (!attente || attente.pour !== app.tranches) {
    const pour = app.tranches, etat = defaut(); attente = { pour, etat };
    queueMicrotask(() => { if (attente?.pour === app.tranches && !('sante' in app.tranches)) tranche<EtatSante>('sante', () => etat); });
  }
  return attente.etat;
}

/** À appeler en tête du script d'un écran : crée la tranche hors de tout `$derived` (Svelte interdit d'y modifier l'état). */
export const initSante = () => void sante();

// ------------------------------------------------------------------ lectures
export const couvertureDe = (): Couverture | null => (app.compte ? COUVERTURES[app.compte.pass] : null);
export const nomComplet = (prenom: string) => `${prenom} ${app.compte?.nom ?? ''}`.trim();
/** Titulaire d'abord, puis les bénéficiaires ajoutés. */
export const beneficiaires = (): string[] => (app.compte ? [app.compte.prenom, ...sante().beneficiaires] : []);
export const facturesDuMembre = (): FactureSante[] => sante().factures.filter((f) => f.statut !== 'brouillon' && f.numeroMembre === app.compte?.numeroMembre).sort((a, b) => b.date.localeCompare(a.date) || b.numero.localeCompare(a.numero));
export const facturesARegler = () => facturesDuMembre().filter((f) => f.statut === 'a_regler');
export const facturesReglees = () => facturesDuMembre().filter((f) => f.statut === 'payee' || f.statut === 'etalee');
export const enRetard = (f: FactureSante, today = aujourdhui()) => f.statut === 'a_regler' && f.echeance < today;

export interface Utilisation { utilise: number; plafond: number; restant: number; pct: number }
/** Plafond annuel du Pass : part AssureMe des 12 derniers mois pour la carte du membre. */
export function utilisation(numeroMembre = app.compte?.numeroMembre, now = maintenant()): Utilisation {
  const c = couvertureDe(), plafond = c?.plafond ?? 0, debut = jourDe(new Date(now - JOURS_PLAFOND * 86_400_000));
  const faits = sante().factures.filter((f) => f.numeroMembre === numeroMembre && f.statut !== 'brouillon' && f.date >= debut).reduce((s, f) => s + f.assureMe, 0);
  const utilise = Math.min(plafond, sante().plafondInitial + faits);
  return { utilise, plafond, restant: Math.max(0, plafond - utilise), pct: plafond ? Math.min(100, Math.round((utilise / plafond) * 100)) : 0 };
}
export const teleconsultationsUtilisees = (now = maintenant()) =>
  facturesDuMembre().filter((f) => f.source === 'tele' && f.date >= jourDe(new Date(now - JOURS_PLAFOND * 86_400_000))).length;
