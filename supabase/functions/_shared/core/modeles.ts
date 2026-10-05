// Modèles de sous-projets proposés par rubrique (spec §4). Choisir un modèle COPIE ses valeurs : tout reste modifiable.
import { OPTIONS_JEUNE, cleMetrique } from './metriques.ts';
import type { Metrique, PeriodeCible, Sens, TypeMetrique } from './types.ts';

export type RubriqueCle = 'dieu' | 'service' | 'travail' | 'vie' | 'transversal';
export type MetriqueModele = Omit<Metrique, 'id'>;

export interface ModeleSousProjet {
  rubrique: RubriqueCle;
  nom: string;
  /** Nom du projet auquel le modèle se rattache habituellement. */
  projet: string;
  sousProjet: string;
  periode: 'semaine' | 'mois' | 'dates' | 'sans_fin';
  metriques: MetriqueModele[];
  calculs: string[];
}

function M(type: TypeMetrique, nom: string, unite: string, cible: number | null, periode: PeriodeCible = 'jour', sens: Sens = 'plus', dansRapport = true, options?: Metrique['options']): MetriqueModele {
  return { cle: cleMetrique(type, unite, nom), type, nom, unite, cible, periode, sens, dansRapport, options };
}
const min = (n: number) => n * 60;
const dollars = (n: number) => n * 100;

export const MODELES: ModeleSousProjet[] = [
  { rubrique: 'dieu', nom: 'Lecture biblique', projet: 'La lecture de la Bible', sousProjet: '7 chapitres par jour', periode: 'mois',
    metriques: [M('nombre', 'Chapitres lus', 'chapitres', 7), M('reference', 'Passages', '', null), M('temps', 'Temps de lecture', 'min', min(45))],
    calculs: ['Progression = chapitres lus ÷ objectif du mois', 'Rythme = chapitres lus ÷ jours écoulés'] },
  { rubrique: 'dieu', nom: 'Rencontre quotidienne', projet: 'RDQD', sousProjet: '3 rencontres par jour', periode: 'mois',
    metriques: [M('fois', 'Rencontres', '', 3), M('temps', 'Temps', 'min', min(90))], calculs: ['Durée moyenne = temps ÷ rencontres'] },
  { rubrique: 'dieu', nom: 'Prière', projet: 'La prière seule', sousProjet: '2 heures par jour', periode: 'mois',
    metriques: [M('temps', 'Temps de prière', 'min', min(120))], calculs: [] },
  { rubrique: 'dieu', nom: 'Mémorisation de versets', projet: 'La lecture de la Bible', sousProjet: 'Un verset par semaine', periode: 'mois',
    metriques: [M('nombre', 'Versets mémorisés', 'versets', 1, 'semaine'), M('reference', 'Références', '', null)], calculs: [] },
  { rubrique: 'dieu', nom: 'Jeûne', projet: 'Le jeûne', sousProjet: '40 jours', periode: 'dates',
    metriques: [M('choix', 'Type de jeûne', '', 40, 'total', 'plus', true, OPTIONS_JEUNE), M('temps', 'Temps de prière', 'min', min(60))],
    calculs: ['Jours de jeûne = complets + 0,5 × partiels', 'Part du mois = jours dans le mois ÷ 40'] },
  { rubrique: 'dieu', nom: 'Don à Dieu', projet: 'Le don à Dieu', sousProjet: 'Chaque semaine', periode: 'mois',
    metriques: [M('oui_non', 'Don fait', '', 1, 'semaine'), M('montant', 'Montant donné', '$', dollars(50), 'semaine')], calculs: ['Total donné = somme des montants'] },

  { rubrique: 'service', nom: 'Évangélisation', projet: 'L’évangélisation', sousProjet: '5 heures par semaine', periode: 'mois',
    metriques: [M('temps', 'Temps', 'min', min(300), 'semaine'), M('nombre', 'Personnes rencontrées', 'personnes', 5, 'semaine')], calculs: ['Personnes par heure = personnes ÷ temps'] },
  { rubrique: 'service', nom: 'Suivi de disciple', projet: 'La formation des disciples', sousProjet: '8 rencontres ce mois', periode: 'mois',
    metriques: [M('fois', 'Rencontres', '', 8, 'mois'), M('temps', 'Temps', 'min', min(45))], calculs: [] },
  { rubrique: 'service', nom: 'Dons', projet: 'Dons aux frères', sousProjet: '2 dons par mois', periode: 'mois',
    metriques: [M('fois', 'Dons faits', '', 2, 'mois'), M('montant', 'Montant donné', '$', dollars(50), 'mois')], calculs: ['Total donné = somme des montants'] },

  { rubrique: 'travail', nom: 'Livrable à rendre', projet: 'L’excellence professionnelle', sousProjet: 'Livrer le rapport', periode: 'dates',
    metriques: [M('nombre', 'Sections terminées', 'sections', 10, 'total'), M('temps', 'Heures de travail', 'min', min(240), 'semaine')], calculs: ['Avancement = sections ÷ 10'] },
  { rubrique: 'travail', nom: 'Étude / cours', projet: 'L’excellence académique', sousProjet: 'Réussir la session', periode: 'dates',
    metriques: [M('nombre', 'Chapitres révisés', 'chapitres', 11, 'total'), M('temps', 'Temps d’étude', 'min', min(60)), M('note', 'Note obtenue', '/10', 8, 'total')], calculs: [] },
  { rubrique: 'travail', nom: 'Entrepreneuriat', projet: 'Mon projet d’entrepreneuriat', sousProjet: 'Lancer l’offre', periode: 'mois',
    metriques: [M('temps', 'Heures investies', 'min', min(240), 'semaine'), M('montant', 'Chiffre d’affaires', '$', dollars(1000), 'mois'), M('nombre', 'Contacts', 'contacts', 10, 'semaine')],
    calculs: ['CA par heure = chiffre d’affaires ÷ heures'] },

  { rubrique: 'vie', nom: 'Budget du mois', projet: 'La gestion de mes finances', sousProjet: 'Budget du mois', periode: 'mois',
    metriques: [M('montant', 'Entrées', '$', dollars(3800), 'mois'), M('montant', 'Sorties', '$', dollars(2400), 'mois', 'moins'), M('montant', 'Épargne', '$', dollars(600), 'mois')],
    calculs: ['Solde = Entrées − Sorties', 'Reste du budget = budget − Sorties', 'Taux d’épargne = Épargne ÷ Entrées'] },
  { rubrique: 'vie', nom: 'Sport', projet: 'La forme physique', sousProjet: '3 séances par semaine', periode: 'mois',
    metriques: [M('fois', 'Séances', '', 3, 'semaine'), M('distance', 'Distance', 'km', 15000, 'semaine'), M('temps', 'Durée', 'min', min(90), 'semaine')], calculs: ['Allure = durée ÷ distance'] },
  { rubrique: 'vie', nom: 'Poids / santé', projet: 'La forme physique', sousProjet: 'Atteindre 75 kg', periode: 'dates',
    metriques: [M('poids', 'Poids', 'kg', 75000, 'total', 'moins'), M('note', 'Énergie', '/10', 8)], calculs: ['Écart = poids − 75 kg'] },
  { rubrique: 'vie', nom: 'Épargne maison', projet: 'L’achat d’une maison', sousProjet: 'Mise de fonds', periode: 'dates',
    metriques: [M('montant', 'Montant épargné', '$', dollars(60000), 'total')], calculs: ['Reste à épargner = objectif − épargné'] },
  { rubrique: 'vie', nom: 'Rangement du logement', projet: 'L’entretien de mon logement', sousProjet: 'Une pièce par jour', periode: 'mois',
    metriques: [M('nombre', 'Pièces faites', 'pièces', 1), M('temps', 'Temps', 'min', min(30))], calculs: [] },
  { rubrique: 'vie', nom: 'Réveil et sommeil', projet: 'La forme physique', sousProjet: 'Se lever à 5 h', periode: 'mois',
    metriques: [M('heure', 'Heure du lever', '', 300, 'jour', 'moins'), M('temps', 'Sommeil', 'min', min(420))], calculs: ['Écart au lever = heure du lever − 05:00'] },
  { rubrique: 'vie', nom: 'Garde-robe', projet: 'Ma garde-robe', sousProjet: 'Trier et compléter', periode: 'dates',
    metriques: [M('nombre', 'Articles triés', 'articles', 40, 'total'), M('montant', 'Achats', '$', dollars(150), 'total', 'moins')], calculs: [] }
];

export const modelesDeLaRubrique = (r: RubriqueCle) => MODELES.filter((m) => m.rubrique === r);
