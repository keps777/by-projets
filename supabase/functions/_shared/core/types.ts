// Types partagés du noyau (spec §3 et §4). Aucun import externe : ce code tourne dans l'app et dans les fonctions serveur.

export type TypeMetrique =
  | 'temps' | 'fois' | 'nombre' | 'montant' | 'oui_non' | 'choix'
  | 'distance' | 'poids' | 'note' | 'pourcentage' | 'heure' | 'reference';

export type PeriodeCible = 'jour' | 'semaine' | 'mois' | 'total';
export type Sens = 'plus' | 'moins';
export type Aggregation = 'somme' | 'dernier' | 'moyenne' | 'aucune';

/** Date locale « AAAA-MM-JJ ». */
export type Jour = string;
/** Mois « AAAA-MM ». */
export type Mois = string;

export interface OptionChoix { label: string; valeur: number }

/** Les valeurs numériques (cible, saisies) sont toujours dans l'unité de base du type (spec §4). */
export interface Metrique {
  id: string;
  cle: string;
  type: TypeMetrique;
  nom: string;
  unite: string;
  cible: number | null;
  periode: PeriodeCible;
  sens: Sens;
  options?: OptionChoix[];
  dansRapport: boolean;
}

export type StatutSousProjet = 'brouillon' | 'en_cours' | 'a_valider' | 'termine' | 'archive';

export interface SousProjetPeriode {
  debut: Jour;
  fin: Jour | null;
}

/** Une valeur saisie pour une clé, à un jour donné. */
export interface ValeurSaisie { cle: string; jour: Jour; valeur: number; /** Temps estimé à la main (affiché avec « ~ »). */ approx?: boolean; /** Texte associé : référence, passages… */ texte?: string }

export interface Creneau { debut: number; fin: number; titre: string; id?: string }
