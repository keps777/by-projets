// CONTRAT DES DONNÉES : forme exacte des lignes, identique dans PostgreSQL (supabase/migrations), dans le cache local
// (Dexie) et dans les fonctions serveur. Noms de tables et de colonnes en français, comme la spec §3.
import type { Regle } from './recurrence.ts';
import type { OptionChoix, PeriodeCible, Sens, StatutSousProjet, TypeMetrique } from './types.ts';
import type { EtatBloc } from './minuteur.ts';

/** Colonnes présentes dans TOUTES les tables. `supprime_le` marque une suppression (pour que les autres appareils la voient). */
export interface Base {
  id: string;
  user_id: string;
  created_at: string;
  /** Mis à jour par le serveur à chaque écriture : sert à la synchronisation (le dernier écrit gagne, ligne par ligne). */
  updated_at: string;
  supprime_le: string | null;
}

export interface Profil extends Base {
  prenom: string;
  nom_rapport: string;
  langue_rapport: 'en' | 'fr';
  fuseau: string;
  apparence: 'nuit' | 'jour' | 'auto';
  /** « HH:MM » */
  heure_rapport: string;
  rappel_defaut_min: number;
  titres_visibles: boolean;
  devise: string;
  /** Vrai une fois les rubriques, projets et points par défaut créés. */
  initialise: boolean;
  /** Quels rappels recevoir (Réglages). Un rappel d'un type désactivé est annulé par le serveur sans être envoyé. */
  recevoir_bloc: boolean;
  recevoir_rapport: boolean;
  recevoir_recap_semaine: boolean;
  recevoir_recap_mois: boolean;
}

export interface Rubrique extends Base { cle: string | null; nom: string; couleur: string; ordre: number; archivee: boolean }
export interface Projet extends Base { rubrique_id: string; numero: number | null; nom: string; ordre: number; statut: 'actif' | 'pause' | 'archive' }

export interface Fiche { quoi: string; pourquoi: string; qui: string; ou: string; quand: string; comment: string; combien: string }

export interface SousProjetLigne extends Base {
  projet_id: string;
  nom: string;
  debut: string;
  fin: string | null;
  statut: StatutSousProjet;
  metrique_pilote_id: string | null;
  reprise_passe: boolean;
  fiche: Fiche;
  bilan: string | null;
  termine_le: string | null;
}

export interface MetriqueLigne extends Base {
  sous_projet_id: string;
  cle: string;
  type: TypeMetrique;
  nom: string;
  unite: string;
  /** Unité de base (secondes, centimes, mètres…). */
  cible: number | null;
  periode_cible: PeriodeCible;
  sens: Sens;
  options: OptionChoix[] | null;
  dans_rapport: boolean;
  ordre: number;
}

export interface Tache extends Base {
  titre: string;
  projet_id: string | null;
  regle: Regle;
  /** Minutes depuis minuit (heure locale). */
  heure_debut: number;
  duree_min: number;
  rappel_min: number | null;
  /** Rappels plus tôt, en minutes avant le début (2 h = 120, la veille = 1440…). Absent sur les anciennes lignes. */
  rappels_avant_min?: number[];
  actif: boolean;
}
export interface TacheAlimente extends Base { tache_id: string; sous_projet_id: string }
export interface TacheAttendu extends Base { tache_id: string; cle: string; valeur_prevue: number }

export interface Occurrence extends Base {
  tache_id: string;
  /** Jour local « AAAA-MM-JJ ». Unique avec tache_id. */
  jour: string;
  debut: string;
  fin: string;
  etat: EtatBloc;
  demarree_a: string | null;
  pause_depuis: string | null;
  pause_cumulee_s: number;
  terminee_a: string | null;
  /** Vrai si l'occurrence a été déplacée ou modifiée à part de sa série. */
  exception: boolean;
}

export type SourceSaisie = 'bloc' | 'focus' | 'minuteur' | 'manuel' | 'rattrapage';
export interface Saisie extends Base {
  projet_id: string | null;
  occurrence_id: string | null;
  jour: string;
  source: SourceSaisie;
  note: string | null;
  approx: boolean;
}
export interface SaisieValeur extends Base {
  saisie_id: string;
  cle: string;
  valeur_num: number | null;
  valeur_txt: string | null;
  /** Passages `[{livre, de, a}]` (référence), ou `DetailMouvement` pour un mouvement d'argent (montant). */
  detail: DetailMouvement | unknown[] | null;
}
/** Détail d'un mouvement d'argent (suivi des finances) : son libellé et sa catégorie. */
export interface DetailMouvement { libelle: string | null; categorie: string | null }

export interface MesurePoint { cle: string; sous_projet_id: string | null }
export interface PointRapportLigne extends Base { ordre: number; code: string; libelle: string; projet_id: string | null; mesures: MesurePoint[]; actif: boolean }
export interface PresetExport extends Base { nom: string; points: string[]; ordre: number }
export interface RapportLigne extends Base { jour: string; contenu: unknown; genere_a: string; maj_a: string; envoye_a: string | null }

export type TypeRappel = 'bloc' | 'rapport' | 'recap_semaine' | 'recap_mois' | 'valider';
export interface Rappel extends Base {
  type: TypeRappel;
  occurrence_id: string | null;
  rapport_id: string | null;
  envoyer_a: string;
  etat: 'en_attente' | 'envoye' | 'echec' | 'annule';
  /** Unique par utilisateur : un rappel ne part qu'une fois. Ex. `${occurrence_id}:10`. */
  cle_unique: string;
  tentatives: number;
  erreur: string | null;
}
export interface AbonnementPush extends Base { endpoint: string; cle_p256dh: string; cle_auth: string; appareil: string | null; dernier_succes: string | null }

/** Tables synchronisées, dans l'ordre où elles peuvent être écrites (les parents d'abord). */
export const TABLES = [
  'profils', 'rubriques', 'projets', 'sous_projets', 'metriques', 'taches', 'tache_alimente', 'tache_attendus',
  'occurrences', 'saisies', 'saisie_valeurs', 'points_rapport', 'presets_export', 'rapports', 'rappels', 'abonnements_push'
] as const;
export type NomTable = (typeof TABLES)[number];

export interface LignesParTable {
  profils: Profil; rubriques: Rubrique; projets: Projet; sous_projets: SousProjetLigne; metriques: MetriqueLigne;
  taches: Tache; tache_alimente: TacheAlimente; tache_attendus: TacheAttendu; occurrences: Occurrence;
  saisies: Saisie; saisie_valeurs: SaisieValeur; points_rapport: PointRapportLigne; presets_export: PresetExport;
  rapports: RapportLigne; rappels: Rappel; abonnements_push: AbonnementPush;
}
