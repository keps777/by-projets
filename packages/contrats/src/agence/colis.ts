import { ETATS_COLIS } from "@afrimove/domain";
import { z } from "zod";
import {
  SchemaFcfaPositif,
  SchemaId,
  SchemaImprimante,
  SchemaIsoDouala,
  SchemaModePaiement,
  SchemaSequence,
  SchemaTelephone,
} from "./commun";
import { SchemaResultatSimple, definirEvenement } from "./evenements";

/* ------------------------------------------------------------------ communs */

export const SchemaContactColis = z.object({
  nom: z.string().min(1),
  telephone: SchemaTelephone,
});
export type ContactColis = z.infer<typeof SchemaContactColis>;

export const SchemaLigneDevisColis = z.object({
  code: z.string().min(1),
  libelle: z.string().min(1),
  montant: SchemaFcfaPositif,
});

/** Le prix d'un colis au guichet, chaque ligne détaillée (voir `devisColis` du domaine). */
export const SchemaDevisColis = z.object({
  lignes: z.array(SchemaLigneDevisColis),
  total: SchemaFcfaPositif,
});
export type DevisColis = z.infer<typeof SchemaDevisColis>;

/** Un départ où charger le colis, avec le remplissage de sa soute. */
export const SchemaDepartSoute = z.object({
  departId: SchemaId,
  heureDepart: SchemaIsoDouala,
  destination: z.string().min(1),
  /** Part de la soute déjà occupée, en pourcentage entier. */
  soutePct: z.number().int().min(0).max(100),
});
export type DepartSoute = z.infer<typeof SchemaDepartSoute>;

/* ------------------------------------------------------------------ colis au guichet */

export const SchemaParamsColisFormulaire = z.object({ guichetId: SchemaId.optional() });
export type ParamsColisFormulaire = z.infer<typeof SchemaParamsColisFormulaire>;

/** Saisie en cours d'un colis, reprise après une coupure (gardée sur l'appareil). */
export const SchemaBrouillonColis = z.object({
  photoPrise: z.boolean(),
  expediteur: SchemaContactColis,
  destinataire: SchemaContactColis,
  contenu: z.string().min(1),
  poidsKg: z.number().positive(),
  valeurDeclaree: SchemaFcfaPositif,
  assure: z.boolean(),
  departId: SchemaId,
  modePaiement: SchemaModePaiement,
});
export type BrouillonColis = z.infer<typeof SchemaBrouillonColis>;

/** Étiquette 58 × 40 mm : le code de retrait n'y figure jamais, il part par SMS au destinataire. */
export const SchemaEtiquetteColis = z.object({
  largeurMm: z.number().int().positive(),
  hauteurMm: z.number().int().positive(),
  trajet: z.object({ origine: z.string().min(1), destination: z.string().min(1) }),
  /** Téléphone du destinataire masqué : « ···· 18 22 ». */
  destinataireMasque: z.string().min(1),
  poidsKg: z.number().positive(),
  heureDepart: SchemaIsoDouala,
});

/** Tout ce qu'il faut pour enregistrer un colis au guichet (planche « GuichetColis »). */
export const SchemaColisFormulaire = z.object({
  prochainNumero: z.object({ sequence: SchemaSequence, numero: z.string().min(1) }),
  guichet: z.object({ id: SchemaId, rang: z.number().int().min(1) }),
  departs: z.array(SchemaDepartSoute),
  /** Autre ville : le colis part via une autre compagnie (inter-agences). */
  autreVilleDisponible: z.boolean(),
  imprimante: SchemaImprimante,
  devis: SchemaDevisColis,
  etiquette: SchemaEtiquetteColis,
  brouillon: SchemaBrouillonColis.nullable(),
});
export type ColisFormulaire = z.infer<typeof SchemaColisFormulaire>;

/**
 * Enregistrer un colis au guichet : photo, étiquette, encaissement. Le numéro C-GARE-AAMMJJ-NNNN
 * est pris dans la plage de l'appareil ; le code de retrait à 6 chiffres est tiré par le serveur à
 * la synchronisation et envoyé au destinataire seul (jamais sur l'appareil ni sur l'étiquette).
 */
export const EVENEMENT_COLIS_ENREGISTRE = definirEvenement({
  type: "colis.enregistre",
  numerote: true,
  donnees: z.object({
    colisId: SchemaId,
    departId: SchemaId,
    expediteur: SchemaContactColis,
    destinataire: SchemaContactColis,
    contenu: z.string().min(1),
    poidsKg: z.number().positive(),
    valeurDeclaree: SchemaFcfaPositif,
    assure: z.boolean(),
    /** Référence de la photo prise au dépôt, stockée à part. */
    photoRef: z.string().min(1),
    paiement: z.object({ mode: SchemaModePaiement, montant: SchemaFcfaPositif }),
  }),
  cible: (d) => ({ type: "colis", id: d.colisId }),
});

export const SchemaColisEnregistre = z.object({
  colisId: SchemaId,
  /** C-GARE-AAMMJJ-NNNN */
  numero: z.string().min(1),
  sequence: SchemaSequence,
  etat: z.enum(ETATS_COLIS),
  prixTotal: SchemaFcfaPositif,
  /** Le code de retrait est envoyé au destinataire seul, par SMS, à la synchronisation. */
  smsDestinataire: z.enum(["envoye", "au_retour_du_reseau"]),
});
export type ColisEnregistre = z.infer<typeof SchemaColisEnregistre>;

export const SchemaResultatColis = SchemaResultatSimple.extend({ colis: SchemaColisEnregistre });
export type ResultatColis = z.infer<typeof SchemaResultatColis>;

/* ------------------------------------------------------------------ dépôt prépayé */

export const SchemaParamsColisDepot = z.object({
  /** Code lu sur l'écran du client : C-ALP-DLA-270105-0017. */
  code: z.string().min(1),
});
export type ParamsColisDepot = z.infer<typeof SchemaParamsColisDepot>;

/** Le colis payé dans l'app que le guichet vient de scanner (planche « Depot »). */
export const SchemaColisDepot = z.object({
  colisId: SchemaId,
  numero: z.string().min(1),
  /** Le code tel que le client l'affiche. */
  codeLu: z.string().min(1),
  etat: z.enum(ETATS_COLIS),
  payeDansApp: SchemaFcfaPositif,
  trouveA: SchemaIsoDouala,
  expediteur: SchemaContactColis,
  destinataire: z.object({ nom: z.string().min(1), destination: z.string().min(1) }),
  declare: z.object({
    contenu: z.string().min(1),
    poidsKg: z.number().positive(),
    valeurDeclaree: SchemaFcfaPositif,
    assure: z.boolean(),
  }),
  depart: SchemaDepartSoute,
  verifications: z.object({
    poidsReleveKg: z.number().positive().nullable(),
    poidsConforme: z.boolean().nullable(),
    photoRequise: z.boolean(),
    /** Au-delà de ce dépassement, le client paie un complément en MoMo. */
    seuilDepassementKg: z.number().positive(),
  }),
});
export type ColisDepot = z.infer<typeof SchemaColisDepot>;

/** Accepter un colis prépayé : poids relevé, photo. Rien à encaisser (sauf complément de poids). */
export const EVENEMENT_COLIS_DEPOSE = definirEvenement({
  type: "colis.depose",
  numerote: false,
  donnees: z.object({
    colisId: SchemaId,
    poidsReleveKg: z.number().positive(),
    photoRef: z.string().min(1),
    /** Complément à payer par MoMo si le poids dépasse le seuil, sinon 0. */
    complement: SchemaFcfaPositif,
  }),
  cible: (d) => ({ type: "colis", id: d.colisId }),
});

export const SchemaResultatDepot = SchemaResultatSimple.extend({
  colis: SchemaColisEnregistre,
  complementDemande: SchemaFcfaPositif,
});
export type ResultatDepot = z.infer<typeof SchemaResultatDepot>;
