// Tranche « entreprise » : l'employeur partenaire (inscription, salariés, invitations, suivi des retenues, attestations).
// Le portail employeur et l'application membre lisent la même tranche (voir `partEmployeurDuPass`).
import type { Pass } from '../../core/credit.ts';
import type { Jour } from '../../core/dates.ts';
import { normaliserId, PLAFOND_PART_EMPLOYEUR, type ChampsInscription, type PartEmployeur } from '../../core/entreprise.ts';
import { partEmployeurPass } from '../../core/prelevement.ts';
import { PRIX_PASS } from '../../core/sante.ts';
import { app, tranche } from '../../data/store.svelte.ts';
import type { Compte } from '../../data/types.ts';

export const CLE = 'entreprise';
export type StatutSalarie = 'invite' | 'nouveau' | 'valide';
export interface Salarie {
  id: string; nom: string; matricule: string; telephone: string; service: string; salaire: number;
  /** Pass choisi par le salarié ; null tant qu'il n'est pas inscrit. */ pass: Pass | null;
  score: number; /** Mensualités de crédit à retenir. */ credit: number; coffre: number;
  statut: StatutSalarie; ajoute: number; anciennete?: string;
}
export interface Invitation { id: string; telephone: string; envoyee: number; relances: number }
export interface Attestation { id: string; numero: string; salarieId: string; salarie: string; matricule: string; salaire: number; ts: number }
export type SuiviRetenue = 'integre' | 'reverse';
export interface Entreprise {
  raisonSociale: string; rccm: string; niu: string; secteur: string; ville: string; effectif: number;
  contact: { nom: string; fonction: string; telephone: string };
  jourPaie: number; part: PartEmployeur; code: string;
  /** `envoye` : dossier en cours de vérification (sans effet sur les Pass) ; `valide` : la part employeur s'applique. */
  statut: 'envoye' | 'valide'; cree: number; signataire: string;
}
export interface EtatEntreprise {
  entreprise: Entreprise | null;
  brouillon: Partial<ChampsInscription> | null;
  salaries: Salarie[];
  invitations: Invitation[];
  attestations: Attestation[];
  /** Avancement du fichier de retenues, par jour de paie. Absent : fichier généré, pas encore intégré. */
  suivi: Record<Jour, SuiviRetenue>;
}

const h = (jours: number) => Date.now() - jours * 86_400_000;
const s = (id: string, nom: string, matricule: string, telephone: string, service: string, salaire: number, pass: Pass | null, score: number, credit: number, coffre: number, statut: StatutSalarie, jours: number, anciennete?: string): Salarie =>
  ({ id, nom, matricule, telephone, service, salaire, pass, score, credit, coffre, statut, ajoute: h(jours), anciennete });

/** Entreprise de la démo : NDIBA LOGISTIQUE, qui prend en charge la moitié du Pass de ses salariés (maquettes). */
export function demoEntreprise(): EtatEntreprise {
  return {
    entreprise: {
      raisonSociale: 'NDIBA LOGISTIQUE', rccm: 'RC/DLA/2014/B/1287', niu: 'M012345678901', secteur: 'Transport et logistique', ville: 'Douala', effectif: 260,
      contact: { nom: 'Ndiba RH', fonction: 'Responsable des ressources humaines', telephone: '691224821' }, jourPaie: 28, part: 0.5, code: 'NDL-4821', statut: 'valide', cree: h(400), signataire: 'Ndiba RH'
    },
    brouillon: null,
    salaries: [
      s('s-aicha', 'Aïcha Ndiba', 'NDL-0412', '690123456', 'Logistique', 520_000, 'famille', 742, 44_000, 12_500, 'valide', 380, '4 ans'),
      s('s-jp', 'Jean-Paul Mbarga', 'NDL-0188', '677100188', 'Flotte', 900_000, 'famille', 760, 182_400, 0, 'valide', 300, '9 ans'),
      s('s-carine', 'Carine Fotso', 'NDL-0533', '699100533', 'Comptabilité', 400_000, 'essentiel', 640, 120_000, 0, 'valide', 200, '2 ans'),
      s('s-ibrahim', 'Ibrahim Bello', 'NDL-0097', '655100097', 'Entrepôt', 300_000, 'famille', 615, 110_000, 0, 'valide', 250, '11 ans'),
      s('s-estelle', 'Estelle Nkoulou', 'NDL-0621', '671100621', 'Accueil', 250_000, 'essentiel', 520, 25_000, 0, 'nouveau', 3, '1 an'),
      s('s-herve', 'Hervé Tchinda', 'NDL-0302', '690100302', 'Entrepôt', 210_000, 'essentiel', 580, 0, 0, 'valide', 150, '6 ans'),
      s('s-mireille', 'Mireille Essama', 'NDL-0710', '696100710', 'Ressources humaines', 480_000, 'famille', 690, 39_500, 0, 'valide', 220, '3 ans'),
      s('s-thierry', 'Thierry Manga', 'NDL-0255', '677100255', 'Direction commerciale', 1_100_000, 'premium', 810, 100_500, 0, 'valide', 330, '8 ans'),
      s('s-olivia', 'Olivia Ndzana', 'NDL-0874', '655100874', 'Logistique', 320_000, 'essentiel', 540, 0, 25_000, 'nouveau', 2, '1 an'),
      s('s-blaise', 'Blaise Ekotto', 'NDL-0149', '699100149', 'Flotte', 230_000, 'essentiel', 600, 0, 0, 'valide', 180, '5 ans'),
      s('s-prisca', 'Prisca Ngo Bell', 'NDL-0905', '671100905', 'Comptabilité', 350_000, null, 0, 0, 0, 'invite', 4)
    ],
    invitations: [{ id: 'i-1', telephone: '690100777', envoyee: h(1), relances: 0 }, { id: 'i-2', telephone: '655100888', envoyee: h(5), relances: 1 }],
    attestations: [], suivi: {}
  };
}
export const vide = (): EtatEntreprise => ({ entreprise: null, brouillon: null, salaries: [], invitations: [], attestations: [], suivi: {} });
const defaut = () => (app.mode === 'demo' ? demoEntreprise() : vide());

/** Tranche à modifier : créée à la demande (à appeler dans une action ou à l'initialisation d'un composant, pas dans un `$derived`). */
export const ent = (): EtatEntreprise => tranche<EtatEntreprise>(CLE, defaut);
/** Lecture sans effet de bord (sûre dans un `$derived`) : la valeur par défaut tant que la tranche n'existe pas. */
export const lire = (): EtatEntreprise => (app.tranches[CLE] as EtatEntreprise | undefined) ?? defaut();

/** L'entreprise validée qui emploie ce compte (par nom d'employeur, ou par numéro de téléphone d'un salarié enregistré). */
export function entrepriseDe(compte: Compte | null | undefined): Entreprise | null {
  if (!compte) return null;
  const t = lire();
  const e = t.entreprise;
  if (!e) return null;
  const memeNom = normaliserId(compte.employeur) === normaliserId(e.raisonSociale);
  return memeNom || t.salaries.some((x) => x.telephone === compte.telephone) ? e : null;
}
/**
 * Part du Pass du compte payée par son employeur partenaire, en FCFA par mois (0 si l'employeur n'est pas partenaire ou si son dossier
 * n'est pas encore validé). Le moteur de paie s'en sert pour réduire la ligne « Pass » : `prix du Pass − partEmployeurDuPass(compte)`.
 */
export function partEmployeurDuPass(compte: Compte | null | undefined): number {
  const e = entrepriseDe(compte);
  if (!compte || !e || e.statut !== 'valide') return 0;
  return partEmployeurPass(PRIX_PASS[compte.pass], e.part, PLAFOND_PART_EMPLOYEUR);
}
