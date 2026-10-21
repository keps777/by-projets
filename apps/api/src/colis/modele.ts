import type {
  CanalColis,
  EntreeHistorique,
  EtatColis,
  Fcfa,
  LigneDevis,
  ModeColis,
  MotifReclamation,
} from "./regles";

/**
 * Modèle de données du module colis : ce que les ports de persistance gardent.
 * Les téléphones sont ici en clair ; l'adaptateur PostgreSQL les chiffre (`ChiffrementService`,
 * contexte `colis.expediteur` / `colis.destinataire`) et tient un index aveugle (voir README).
 */

export interface GareRef {
  id: string;
  /** Code de 3 lettres des numéros (DLA, BAF…). */
  code: string;
  nom: string;
  ville: string;
}

export interface ContactColis {
  nom: string;
  telephone: string;
}

export interface PaiementColis {
  /** Référence de la transaction (MoMo, Orange Money, carte) ou du guichet (cash). */
  reference: string;
  moyen: string;
  etat: "paye" | "en_attente";
  montant: Fcfa;
  /** Numéro de paiement mobile (MoMo, Orange Money), s'il y en a un. */
  numero: string | null;
}

/** Le code de retrait n'existe en clair nulle part : haché + sel pour la vérification, chiffré pour renvoi. */
export interface CodeRetraitStocke {
  hache: string;
  sel: string;
  /** AES-256-GCM (`ChiffrementService`), lié au colis : sert à renvoyer le code et à l'afficher à l'expéditeur. */
  chiffre: string;
  /** Essais faux depuis le dernier déblocage. */
  essais: number;
  bloque: boolean;
  /** Dernier envoi au destinataire. */
  envoyeA: string | null;
  smsDestinataire: "envoye" | "au_retour_du_reseau";
}

export interface DepotColis {
  a: string;
  poidsReleveKg: number;
  photoRef: string;
  par: string;
}

export interface RemiseColis {
  a: string;
  par: string;
  photoRef: string | null;
}

export interface ColisStocke {
  id: string;
  /** Pour la concurrence optimiste : chaque écriture exige la version lue. */
  version: number;
  /** C-GARE-AAMMJJ-NNNN, jamais modifié. */
  numero: string;
  sequence: number;
  /** AAMMJJ de la création. */
  jour: string;
  canal: CanalColis;
  mode: ModeColis;
  compagnieId: string | null;
  gareOrigine: GareRef;
  gareDestination: GareRef;
  departId: string | null;
  heureDepart: string | null;
  arriveePrevue: string | null;
  /** Le voyageur qui a créé le colis dans l'app ; `null` pour un colis du guichet. */
  expediteurId: string | null;
  expediteur: ContactColis;
  destinataire: ContactColis & { surnom: string | null };
  contenu: string;
  poidsKg: number;
  valeurDeclaree: Fcfa;
  assure: boolean;
  valeurAssuree: Fcfa;
  assurance: { police: string | null; enAttente: boolean };
  relaisId: string | null;
  adresseLivraison: string | null;
  /** Port du transport en gare (sert à l'indemnisation : 10 × le port). */
  port: Fcfa;
  devis: LigneDevis[];
  prixTotal: Fcfa;
  /** Complément de poids payé au dépôt. */
  complementPoids: Fcfa;
  paiement: PaiementColis | null;
  code: CodeRetraitStocke;
  creeA: string;
  disponibleDepuis: string | null;
  depose: DepotColis | null;
  remise: RemiseColis | null;
  etat: EtatColis;
  historique: EntreeHistorique[];
  /** Événements du guichet déjà appliqués (idempotence par UUID). */
  evenementIds: string[];
}

export interface PhotoColis {
  /** Référence opaque de la photo téléversée. */
  ref: string;
  colisId: string | null;
  genre: "envoi" | "depot" | "remise";
  priseA: string;
  /** Prise de vue + 90 jours. */
  expireA: string;
  supprimeeA: string | null;
}

export type StatutReclamation = "ouverte" | "acceptee" | "refusee";

export interface Indemnisation {
  type: "valeur_assuree" | "multiple_port" | "geste_commercial";
  montant: Fcfa;
  /** Dossier chez l'assureur partenaire (colis assuré, perte). */
  dossierAssureur: string | null;
}

export interface ReclamationStockee {
  reference: string;
  colisId: string;
  colisNumero: string;
  compagnieId: string | null;
  auteurId: string;
  motif: MotifReclamation;
  message: string | null;
  ouverteA: string;
  reponseAvant: string;
  statut: StatutReclamation;
  decision: {
    a: string;
    par: string;
    indemnisation: Indemnisation | null;
    motif: string | null;
  } | null;
}

export interface Acteur {
  id: string;
  role: string;
  compagnieId: string | null;
  gareId: string | null;
}

export interface DepartColis {
  id: string;
  compagnieId: string;
  compagnieNom: string;
  gareOrigine: GareRef;
  gareDestination: GareRef;
  heureDepart: string;
  arriveePrevue: string;
  /** Port du transport d'un colis en gare, fixé par la ligne. */
  portColis: Fcfa;
  /** Part de la soute déjà occupée, en pourcentage entier. */
  soutePct: number;
  /** Le départ accepte encore des colis. */
  ouvertAuColis: boolean;
}

export interface RelaisRef {
  id: string;
  nom: string;
  ville: string;
  actif: boolean;
}

export interface GuichetRef {
  id: string;
  /** Rang 1 à 3 : détermine la plage de numéros. */
  rang: number;
  gare: GareRef;
  compagnieId: string;
}
