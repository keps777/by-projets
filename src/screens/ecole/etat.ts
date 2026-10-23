// Tranche d'état « ecole » : partagée entre l'espace membre (/ecole) et le portail de l'école partenaire (/portail/ecole).
// L'école publie ses frais, ses notes et ses messages ; la famille choisit un plan ; les deux côtés lisent la même tranche.
import { untrack } from 'svelte';
import { app, maintenant, tranche } from '../../data/store.svelte.ts';
import type { Jour } from '../../core/dates.ts';

export interface FraisNiveau { niveau: string; montant: number }
export interface Ecole {
  id: string; nom: string; ville: string; contact: string;
  /** Grille des frais publiée par l'école, par niveau. */
  grille: FraisNiveau[]; grillePubliee: number;
  /** Chiffres propres à l'école (hors AssureMe) : élèves, familles, familles connectées à l'app. */
  eleves: number; familles: number; connectees: number; invitees: boolean;
  /** Élèves dont les frais ont déjà été payés via AssureMe, avant ceux de la tranche. */
  elevesAMBase: number;
  /** Montants déjà encaissés via AssureMe / restant à encaisser hors AssureMe, avant les paiements de la tranche. */
  encaisseBase: number; resteBase: number;
  /** Part des frais payés par niveau (0 à 100). */
  niveauxPct: Record<string, number>;
}
export interface Enfant {
  id: string; prenom: string;
  /** Nom tel qu'il figure dans la liste de classe de l'école (« Ndiba Lisa »). */
  eleve: string; ecoleId: string;
  /** Classe à la rentrée visée (détermine les frais). */
  niveau: string; classeActuelle: string | null;
  inclus: boolean;
  absences: number; retards: number; aJustifier: number;
}
export interface LignePlan { enfantId: string; prenom: string; eleve: string; ecoleId: string; ecole: string; niveau: string; montant: number }
export interface Plan {
  id: string; rentree: Jour; libelle: string; accord: Jour; signeLe: number; signataire: string;
  lignes: LignePlan[]; total: number; coffre: number; coffreSource: 'coffres' | 'saisi'; capital: number;
  duree: number; taux: number; tauxLancement: boolean; mensualite: number; jourPrelevement: number;
  /** Crédit correspondant dans `app.credits` : il porte les mensualités payées et la prochaine échéance. */
  creditId: string; statut: 'actif' | 'termine';
}
export interface Paiement { id: string; ecoleId: string; planId: string | null; famille: string; eleve: string; objet: string; montant: number; ts: number; ref: string }
export interface Demande { id: string; ecoleId: string; eleve: string; libelle: string; montant: number; payee: boolean }
export interface Cible { tous?: boolean; classe?: string; eleve?: string }
export interface Message { id: string; ecoleId: string; ts: number; sens: 'ecole' | 'famille'; de: string; ini: string; texte: string; cible: Cible; demandeId?: string }
export interface Evaluation { id: string; ecoleId: string; classe: string; matiere: string; intitule: string; notes: Record<string, string>; publie: boolean }
export interface AutreFamille { id: string; ecoleId: string; famille: string; eleve: string; niveau: string; montant: number; duree: number; ts: number }
export interface Soutien { id: string; enfantId: string; creneau: string; montant: number; ts: number }

export interface EtatEcole {
  ecoles: Ecole[];
  /** Listes de classe : école → classe → élèves. */
  classes: Record<string, Record<string, string[]>>;
  enfants: Enfant[];
  plans: Plan[];
  paiements: Paiement[];
  demandes: Demande[];
  messages: Message[];
  evaluations: Evaluation[];
  /** Élèves dont l'école a envoyé le bulletin aux parents (clé `ecoleId|élève`). */
  bulletinsEnvoyes: Record<string, number>;
  autresFamilles: AutreFamille[];
  soutiens: Soutien[];
  /** Montant du coffre « Rentrée » saisi à la main, quand la fonctionnalité Coffres n'est pas là. */
  coffreSaisi: number;
}

export const MAX_ENFANTS = 4;
export const PRIX_SOUTIEN = 20_000;
export const CRENEAUX_SOUTIEN = ['Mercredi 28 oct. · 17 h · visio, 1 h', "Samedi 31 oct. · 9 h · à l'école, salle 4", 'Mercredi 4 nov. · 17 h · visio, 1 h'];
export const TRIMESTRE = 'Trimestre 1';

const grille = (...p: [string, number][]): FraisNiveau[] => p.map(([niveau, montant]) => ({ niveau, montant }));
const ecolesDefaut = (demo: boolean): Ecole[] => [
  {
    id: 'la-rochelle', nom: 'Collège La Rochelle', ville: 'Douala', contact: 'secretariat@larochelle.exemple.cm',
    grille: grille(['6e', 190_000], ['5e', 200_000], ['4e', 220_000], ['3e', 250_000]), grillePubliee: 0,
    eleves: 540, familles: 540, connectees: demo ? 412 : 0, elevesAMBase: demo ? 96 : 0, invitees: false, encaisseBase: demo ? 43_200_000 : 0, resteBase: demo ? 18_650_000 : 0,
    niveauxPct: { '6e': 92, '5e': 88, '4e': 95, '3e': 81 }
  },
  {
    id: 'bambins', nom: 'École Les Bambins', ville: 'Douala', contact: 'direction@bambins.exemple.cm',
    grille: grille(['CP', 120_000], ['CE1', 130_000], ['CE2', 140_000], ['CM1', 150_000], ['CM2', 150_000]), grillePubliee: 0,
    eleves: 210, familles: 190, connectees: demo ? 140 : 0, elevesAMBase: demo ? 41 : 0, invitees: false, encaisseBase: demo ? 12_400_000 : 0, resteBase: demo ? 6_100_000 : 0,
    niveauxPct: { CP: 96, CE1: 93, CE2: 90, CM1: 89, CM2: 94 }
  },
  {
    id: 'lycee-bilingue', nom: 'Lycée Bilingue de Bonanjo', ville: 'Douala', contact: 'accueil@lyceebilingue.exemple.cm',
    grille: grille(['2nde', 240_000], ['1re', 200_000], ['Tle', 260_000]), grillePubliee: 0,
    eleves: 380, familles: 350, connectees: demo ? 255 : 0, elevesAMBase: demo ? 70 : 0, invitees: false, encaisseBase: demo ? 21_800_000 : 0, resteBase: demo ? 9_300_000 : 0,
    niveauxPct: { '2nde': 90, '1re': 84, Tle: 87 }
  }
];

const classesDefaut = (): Record<string, Record<string, string[]>> => ({
  'la-rochelle': {
    '4e B': ['Atangana Kevin', 'Essomba Junior', 'Ndiba Lisa', 'Oumarou Mariam', 'Tamba Divine', 'Biyong Sandra'],
    '4e A': ['Fouda Alain', 'Mvondo Chantal', 'Nguele Patrick', 'Zogo Esther', 'Abega Rose'],
    '3e A': ['Kenfack Ruth', 'Ondoa Samuel', 'Tchoumi Nadège', 'Wouapi Brice', 'Yimga Carole']
  },
  bambins: { CE2: ['Ndiba Junior', 'Mbarga Ines', 'Ekani Paul', 'Fotso Aline', 'Nana Yvan'] },
  'lycee-bilingue': { '2nde A': ['Ndiba Marc', 'Etoundi Carine', 'Manga Hugues', 'Bekolo Sylvie', 'Ngassa Eric'] }
});

const MATIERES: Record<string, Record<string, string[]>> = {
  'la-rochelle': { '4e B': ['Mathématiques', 'Anglais', 'SVT', 'Français', 'Histoire-géo'], '4e A': ['Mathématiques', 'Français'], '3e A': ['Mathématiques', 'Français'] },
  bambins: { CE2: ['Lecture', 'Dictée', 'Calcul'] },
  'lycee-bilingue': { '2nde A': ['Mathématiques', 'Physique', 'Français', 'Anglais'] }
};
/** Notes de la persona : [devoir 1, devoir 2] par matière. */
const NOTES_PERSONA: Record<string, Record<string, [number, number]>> = {
  'Ndiba Lisa': { Mathématiques: [17, 15], Anglais: [16, 14], SVT: [15, 14], Français: [12, 14], 'Histoire-géo': [10, 12] },
  'Ndiba Junior': { Lecture: [16, 15], Dictée: [18, 15], Calcul: [14, 15] },
  'Ndiba Marc': { Mathématiques: [12, 13], Physique: [11, 12], Français: [13, 12], Anglais: [14, 13] }
};
const alea = (cle: string) => { let h = 7; for (let i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) % 997; return 8 + (h % 70) / 10; };
const fmtNote = (n: number) => String(Math.round(n * 2) / 2).replace('.', ',');

function evaluationsDefaut(classes: Record<string, Record<string, string[]>>): Evaluation[] {
  const res: Evaluation[] = [];
  for (const [ecoleId, parClasse] of Object.entries(classes)) {
    for (const [classe, eleves] of Object.entries(parClasse)) {
      for (const matiere of MATIERES[ecoleId]?.[classe] ?? []) {
        (['Devoir 1 · 26 sept.', 'Devoir 2 · 10 oct.'] as const).forEach((intitule, k) => {
          const notes: Record<string, string> = {};
          for (const nom of eleves) {
            const p = NOTES_PERSONA[nom]?.[matiere];
            notes[nom] = p ? String(p[k]).replace('.', ',') : fmtNote(alea(`${classe}${matiere}${k}${nom}`));
          }
          // Brouillon de la maquette : mathématiques de 4e B, devoir 2, une note manque encore.
          const brouillon = ecoleId === 'la-rochelle' && classe === '4e B' && matiere === 'Mathématiques' && k === 1;
          if (brouillon) notes['Essomba Junior'] = '';
          res.push({ id: `ev-${ecoleId}-${classe}-${matiere}-${k + 1}`.replace(/\s+/g, '_'), ecoleId, classe, matiere, intitule, notes, publie: !brouillon });
        });
      }
    }
  }
  return res;
}

const il = (jours: number, heure = 12) => { const d = new Date(maintenant()); d.setDate(d.getDate() - jours); d.setHours(heure, 0, 0, 0); return d.getTime(); };

function demoEtat(): Pick<EtatEcole, 'enfants' | 'plans' | 'paiements' | 'demandes' | 'messages' | 'autresFamilles' | 'coffreSaisi' | 'bulletinsEnvoyes'> {
  const lignes: LignePlan[] = [
    { enfantId: 'e-lisa', prenom: 'Lisa', eleve: 'Ndiba Lisa', ecoleId: 'la-rochelle', ecole: 'Collège La Rochelle', niveau: '4e', montant: 220_000 },
    { enfantId: 'e-junior', prenom: 'Junior', eleve: 'Ndiba Junior', ecoleId: 'bambins', ecole: 'École Les Bambins', niveau: 'CE2', montant: 140_000 },
    { enfantId: 'e-marc', prenom: 'Marc', eleve: 'Ndiba Marc', ecoleId: 'lycee-bilingue', ecole: 'Lycée Bilingue de Bonanjo', niveau: '2nde', montant: 240_000 }
  ];
  const ts = Date.parse('2026-09-02T09:00:00');
  return {
    enfants: [
      { id: 'e-lisa', prenom: 'Lisa', eleve: 'Ndiba Lisa', ecoleId: 'la-rochelle', niveau: '3e', classeActuelle: '4e', inclus: true, absences: 0, retards: 1, aJustifier: 0 },
      { id: 'e-junior', prenom: 'Junior', eleve: 'Ndiba Junior', ecoleId: 'bambins', niveau: 'CM1', classeActuelle: 'CE2', inclus: true, absences: 1, retards: 0, aJustifier: 0 },
      { id: 'e-marc', prenom: 'Marc', eleve: 'Ndiba Marc', ecoleId: 'lycee-bilingue', niveau: '1re', classeActuelle: '2nde', inclus: true, absences: 2, retards: 0, aJustifier: 1 }
    ],
    // Crédit scolaire 2026 de la démo : « taux de lancement 0 % », 44 000 × 10 (voir le seed). Tout nouveau plan est calculé à l'annuité exacte.
    plans: [{
      id: 'p-2026', rentree: '2026-09-01', libelle: 'École · rentrée 2026', accord: '2026-09-02', signeLe: ts, signataire: 'Aïcha Ndiba', lignes,
      total: 600_000, coffre: 160_000, coffreSource: 'saisi', capital: 440_000, duree: 10, taux: 0, tauxLancement: true, mensualite: 44_000, jourPrelevement: 28,
      creditId: 'c-ecole', statut: 'actif'
    }],
    paiements: lignes.map((l, i) => ({ id: `pa-2026-${i}`, ecoleId: l.ecoleId, planId: 'p-2026', famille: 'Famille Ndiba', eleve: l.eleve, objet: `Frais de scolarité ${l.niveau} · rentrée 2026`, montant: l.montant, ts: ts + i * 60_000, ref: `AM-2026-${i + 1}` })),
    demandes: [
      { id: 'd-sortie', ecoleId: 'la-rochelle', eleve: 'Ndiba Lisa', libelle: 'Sortie pédagogique du 7 nov.', montant: 5_000, payee: false },
      { id: 'd-photo', ecoleId: 'bambins', eleve: 'Ndiba Junior', libelle: 'Photo de classe du 14 nov.', montant: 2_500, payee: false },
      { id: 'd-examen', ecoleId: 'lycee-bilingue', eleve: 'Ndiba Marc', libelle: 'Frais d\'examen blanc', montant: 5_000, payee: false }
    ],
    messages: [
      { id: 'ms1', ecoleId: 'la-rochelle', ts: il(1, 16), sens: 'ecole', de: 'Mme Kamga · maths', ini: 'MK', texte: 'Très bon devoir, 17/20. Contrôle vendredi.', cible: { eleve: 'Ndiba Lisa' } },
      { id: 'ms2', ecoleId: 'la-rochelle', ts: il(3, 10), sens: 'ecole', de: 'Collège', ini: 'É', texte: 'Sortie pédagogique le 7 nov. Participation 5 000, payable ici.', cible: { eleve: 'Ndiba Lisa' }, demandeId: 'd-sortie' },
      { id: 'ms3', ecoleId: 'bambins', ts: il(2, 15), sens: 'ecole', de: 'M. Dikoume · maître', ini: 'MD', texte: 'Junior lit très bien. Dictée de la semaine : 18/20.', cible: { eleve: 'Ndiba Junior' } },
      { id: 'ms4', ecoleId: 'bambins', ts: il(1, 9), sens: 'ecole', de: 'École', ini: 'É', texte: 'Photo de classe le 14 nov. Participation 2 500, payable ici.', cible: { eleve: 'Ndiba Junior' }, demandeId: 'd-photo' },
      { id: 'ms5', ecoleId: 'lycee-bilingue', ts: il(1, 14), sens: 'ecole', de: 'Mme Eyoum · terminale', ini: 'ME', texte: 'Examen blanc le 20 nov. Inscription au soutien possible.', cible: { eleve: 'Ndiba Marc' } },
      { id: 'ms6', ecoleId: 'lycee-bilingue', ts: il(3, 11), sens: 'ecole', de: 'Lycée', ini: 'LY', texte: "Frais d'examen blanc 5 000, payables ici.", cible: { eleve: 'Ndiba Marc' }, demandeId: 'd-examen' }
    ],
    autresFamilles: [
      { id: 'af1', ecoleId: 'la-rochelle', famille: 'Famille Mballa', eleve: 'Mballa Jordan', niveau: '6e', montant: 190_000, duree: 10, ts: il(40) },
      { id: 'af2', ecoleId: 'la-rochelle', famille: 'Famille Tchoumi', eleve: 'Tchoumi Nadège', niveau: '3e', montant: 250_000, duree: 8, ts: il(41) },
      { id: 'af3', ecoleId: 'bambins', famille: 'Famille Eyenga', eleve: 'Eyenga Léa', niveau: 'CP', montant: 120_000, duree: 6, ts: il(39) },
      { id: 'af4', ecoleId: 'lycee-bilingue', famille: 'Famille Ondoa', eleve: 'Ondoa Priscille', niveau: 'Tle', montant: 260_000, duree: 10, ts: il(38) }
    ],
    coffreSaisi: 160_000,
    bulletinsEnvoyes: {}
  };
}

export function etatDefaut(mode: 'demo' | 'vierge'): EtatEcole {
  const demo = mode === 'demo';
  const classes = classesDefaut();
  const vide = { enfants: [], plans: [], paiements: [], demandes: [], messages: [], autresFamilles: [], coffreSaisi: 0, bulletinsEnvoyes: {} };
  return { ecoles: ecolesDefaut(demo), classes, evaluations: evaluationsDefaut(classes), soutiens: [], ...(demo ? demoEtat() : vide) };
}

/**
 * La tranche « ecole » (créée à la première lecture selon le mode du compte).
 * La création passe par `untrack` : elle peut avoir lieu dans un `$derived` d'un composant, où Svelte interdit de modifier un état.
 */
export function ecole(): EtatEcole {
  if (!('ecole' in app.tranches)) untrack(() => tranche<EtatEcole>('ecole', () => etatDefaut(app.mode)));
  return tranche<EtatEcole>('ecole', () => etatDefaut(app.mode));
}
