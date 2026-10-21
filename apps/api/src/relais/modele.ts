import type { OperateurMobile, Point } from "./regles";

/**
 * Modèle de données des points relais : ce que les ports de persistance gardent.
 * Les téléphones et numéros MoMo sont ici en clair ; un adaptateur PostgreSQL les chiffre
 * (`ChiffrementService`, voir README).
 */

export type { OperateurMobile, Point };

export interface MomoPartenaire {
  /** Numéro mobile money (+237…) qui reçoit les versements. */
  telephone: string;
  operateur: OperateurMobile;
}

/** La fiche que la boutique remplit à l'inscription (`SchemaFicheRelais`). */
export interface FicheRelais {
  nom: string;
  /** Un choix de la liste proposée : « Boutique · alimentation », « Pharmacie »… */
  type: string;
  /** « 7 h – 20 h · lun.–sam. » */
  ouvert: string;
  position: { ville: string; quartier: string; repere: string | null };
  /** « Petits et moyens (≤ 10 kg) » */
  tailleMax: string;
  momo: MomoPartenaire;
  /** Référence de la photo de la façade (déjà téléversée). */
  facadeRef: string;
}

/** Un point relais actif (ou suspendu) : créé à l'activation de la demande. */
export interface PointRelaisStocke {
  id: string;
  /** Pour la concurrence optimiste : chaque écriture exige la version lue. */
  version: number;
  /** « R-BAF-0215 » : le numéro du dossier devient le code du relais. */
  code: string;
  /** Le compte voyageur devenu relais. */
  personneId: string;
  nom: string;
  typeBoutique: string;
  ville: string;
  quartier: string;
  repere: string | null;
  /** Coordonnées relevées par l'agent à la visite ; `null` tant qu'elles ne sont pas connues. */
  position: Point | null;
  ouvert: string;
  tailleMax: string;
  /** Nombre de colis gardés en même temps. */
  capacite: number;
  /** « frigo pour médicaments », « petit colis seulement »… (renseigné par l'agent) */
  particularite: string | null;
  momo: MomoPartenaire;
  facadeRef: string;
  /** Faux : suspendu, il n'apparaît plus dans les recherches et ne reçoit plus de colis. */
  actif: boolean;
  note: number;
  creeA: string;
  premierColisA: string | null;
}

export type EtatDemandeRelais = "recue" | "visite_planifiee" | "activee" | "refusee";

export interface DemandeRelais {
  /** « R-BAF-0215 » */
  dossier: string;
  version: number;
  personneId: string;
  fiche: FicheRelais;
  etat: EtatDemandeRelais;
  deposeeA: string;
  visite: { agent: string; creneau: string; planifieeA: string } | null;
  decision: { a: string; par: string; motif: string | null } | null;
  /** Le point relais créé à l'activation. */
  relaisId: string | null;
}

export interface BrouillonRelais {
  personneId: string;
  fiche: Partial<FicheRelais>;
  enregistreA: string;
}

/** Un colis reçu chez le relais, avec ce qui n'est pas déjà dans l'historique du colis. */
export interface ReceptionRelais {
  colisId: string;
  relaisId: string;
  recuA: string;
  /** Rappel envoyé au destinataire (à partir du 5e jour de garde). */
  rappelEnvoyeA: string | null;
  /** Le relais a ouvert la remise (scan de l'étiquette) sans l'avoir terminée. */
  remiseOuverteA: string | null;
}
