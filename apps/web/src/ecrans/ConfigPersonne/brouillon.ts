import type { patron } from "@afrimove/contrats";
import { afficherTelephone, formaterMontant, lireMontant, lireTelephone } from "./formats";

/**
 * Le brouillon de la fiche : ce que le patron a tapé et qui n'est pas encore enregistré. Rien n'en sort avant la
 * signature par le PIN (`versCreation`, `versModification`). Ces fonctions sont pures, l'écran ne fait que les appeler.
 */

type Personne = patron.PersonneEditable;
export type Role = patron.RoleEquipe;
export type Droits = patron.DroitsPersonne;
export type CleDroit = keyof Droits;
export type Operateur = Personne["operateur"];
type Champs = Omit<patron.CreerPersonne, "signature">["champs"];

/** Dans l'ordre de la planche. */
export const ROLES: readonly Role[] = [
  "guichetier",
  "superviseur",
  "convoyeur",
  "chauffeur",
  "relais",
  "comptable",
];
export const OPERATEURS: readonly Operateur[] = ["MTN", "Orange"];
/** Les guichets d'une gare : trois numérotés et celui de nuit. */
export const GUICHETS: readonly string[] = ["1", "2", "3", "nuit"];
/** Dans l'ordre de la planche. */
export const CLES_DROITS: readonly CleDroit[] = [
  "vendreBilletsEtColis",
  "annulerSansPinSuperviseur",
  "modeCadence",
  "voirCaissesDesAutres",
];

/**
 * Ce que chaque rôle peut faire tant que le patron n'y touche pas (« par défaut du rôle »). Le guichetier est celui
 * de la planche (Joseph M.) ; les autres rôles suivent leur métier : le superviseur valide et voit les caisses de sa
 * gare, l'agent relais vend des colis, le comptable lit les caisses, le bus ne vend pas. À confirmer par le métier.
 */
export const DROITS_PAR_ROLE: Record<Role, Droits> = {
  guichetier: {
    vendreBilletsEtColis: true,
    annulerSansPinSuperviseur: false,
    modeCadence: true,
    voirCaissesDesAutres: false,
  },
  superviseur: {
    vendreBilletsEtColis: true,
    annulerSansPinSuperviseur: true,
    modeCadence: true,
    voirCaissesDesAutres: true,
  },
  convoyeur: {
    vendreBilletsEtColis: false,
    annulerSansPinSuperviseur: false,
    modeCadence: false,
    voirCaissesDesAutres: false,
  },
  chauffeur: {
    vendreBilletsEtColis: false,
    annulerSansPinSuperviseur: false,
    modeCadence: false,
    voirCaissesDesAutres: false,
  },
  relais: {
    vendreBilletsEtColis: true,
    annulerSansPinSuperviseur: false,
    modeCadence: false,
    voirCaissesDesAutres: false,
  },
  comptable: {
    vendreBilletsEtColis: false,
    annulerSansPinSuperviseur: false,
    modeCadence: false,
    voirCaissesDesAutres: true,
  },
};

/** Les rôles qui ont un guichet : les autres n'en ont pas (`guichet: null` dans le contrat). */
export function aUnGuichet(role: Role): boolean {
  return role === "guichetier";
}

/** Les rôles dont la gare est obligatoire : on ne peut pas ouvrir un guichet ni superviser « nulle part ». */
export function gareObligatoire(role: Role): boolean {
  return role === "guichetier" || role === "superviseur";
}

export interface Brouillon {
  nom: string;
  /** Ce qui est tapé dans le champ (pas forcément un numéro valide pendant la frappe). */
  telephone: string;
  operateur: Operateur;
  role: Role;
  /** Identifiant de la gare ; vide tant qu'aucune n'est choisie. */
  gareId: string;
  /** « 1 », « 2 », « 3 » ou « nuit » ; vide tant qu'aucun n'est choisi. */
  guichet: string;
  /** Ce qui est tapé dans le champ (« 95 000 »). */
  salaire: string;
  droits: Droits;
}

/** Une nouvelle personne : champs vides, un guichetier avec les droits de son rôle. */
export function brouillonVide(): Brouillon {
  return {
    nom: "",
    telephone: "",
    operateur: "MTN",
    role: "guichetier",
    gareId: "",
    guichet: "",
    salaire: "",
    droits: { ...DROITS_PAR_ROLE.guichetier },
  };
}

/** Le brouillon de départ d'une modification : la fiche telle que l'API la renvoie. */
export function brouillonDepuis(personne: Personne): Brouillon {
  return {
    nom: personne.nom,
    telephone: afficherTelephone(personne.telephone),
    operateur: personne.operateur,
    role: personne.role,
    gareId: personne.gareId ?? "",
    guichet: personne.guichet ?? "",
    salaire: formaterMontant(personne.salaire),
    droits: { ...personne.droits },
  };
}

/** Changer le rôle remet les droits par défaut de ce rôle (les exceptions se refont après) et lâche le guichet s'il n'en a plus. */
export function changerRole(brouillon: Brouillon, role: Role): Brouillon {
  return {
    ...brouillon,
    role,
    guichet: aUnGuichet(role) ? brouillon.guichet : "",
    droits: { ...DROITS_PAR_ROLE[role] },
  };
}

export function basculerDroit(brouillon: Brouillon, cle: CleDroit): Brouillon {
  return { ...brouillon, droits: { ...brouillon.droits, [cle]: !brouillon.droits[cle] } };
}

/** Les droits qui s'écartent de ceux du rôle : chacun est une exception, tracée avec la signature. */
export function exceptions(brouillon: Brouillon): CleDroit[] {
  const defaut = DROITS_PAR_ROLE[brouillon.role];
  return CLES_DROITS.filter((cle) => brouillon.droits[cle] !== defaut[cle]);
}

export interface Erreurs {
  nom: boolean;
  telephone: boolean;
  gare: boolean;
  guichet: boolean;
  salaire: boolean;
}

export function erreursDuBrouillon(brouillon: Brouillon): Erreurs {
  return {
    nom: brouillon.nom.trim() === "",
    telephone: lireTelephone(brouillon.telephone) === null,
    gare: gareObligatoire(brouillon.role) && brouillon.gareId === "",
    guichet: aUnGuichet(brouillon.role) && brouillon.guichet === "",
    salaire: lireMontant(brouillon.salaire) === null,
  };
}

export function estEnregistrable(erreurs: Erreurs): boolean {
  return !Object.values(erreurs).some(Boolean);
}

/** Tous les champs du brouillon, au format du contrat. Suppose le brouillon valide (`estEnregistrable`). */
export function versChamps(brouillon: Brouillon): Champs {
  return {
    nom: brouillon.nom.trim(),
    telephone: lireTelephone(brouillon.telephone) ?? "",
    operateur: brouillon.operateur,
    role: brouillon.role,
    gareId: brouillon.gareId === "" ? null : brouillon.gareId,
    guichet: aUnGuichet(brouillon.role) && brouillon.guichet !== "" ? brouillon.guichet : null,
    salaire: lireMontant(brouillon.salaire) ?? 0,
    droits: { ...brouillon.droits },
  };
}

export function versCreation(
  brouillon: Brouillon,
  signature: patron.SignaturePin,
): patron.CreerPersonne {
  return { champs: versChamps(brouillon), signature };
}

/** Seulement ce qui a changé par rapport à la fiche de l'API. Vide : rien à enregistrer, donc rien à signer. */
export function champsModifies(brouillon: Brouillon, personne: Personne): Partial<Champs> {
  const nouveau = versChamps(brouillon);
  const modifies: Partial<Champs> = {};
  if (nouveau.nom !== personne.nom) modifies.nom = nouveau.nom;
  if (nouveau.telephone !== personne.telephone) modifies.telephone = nouveau.telephone;
  if (nouveau.operateur !== personne.operateur) modifies.operateur = nouveau.operateur;
  if (nouveau.role !== personne.role) modifies.role = nouveau.role;
  if (nouveau.gareId !== personne.gareId) modifies.gareId = nouveau.gareId;
  if (nouveau.guichet !== personne.guichet) modifies.guichet = nouveau.guichet;
  if (nouveau.salaire !== personne.salaire) modifies.salaire = nouveau.salaire;
  if (CLES_DROITS.some((cle) => nouveau.droits[cle] !== personne.droits[cle])) {
    modifies.droits = nouveau.droits;
  }
  return modifies;
}

export function versModification(
  brouillon: Brouillon,
  personne: Personne,
  signature: patron.SignaturePin,
): patron.ModifierPersonne {
  return {
    personneId: personne.id,
    champs: champsModifies(brouillon, personne),
    signature,
  };
}
