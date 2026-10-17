import { z } from "zod";
import { SchemaColisProprietaire } from "./colis";
import {
  SchemaDevisColis,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaModeColis,
  SchemaMoyenPaiementColis,
  SchemaRefPhoto,
  SchemaTelephone,
} from "./commun";

/* ------------------------------------------------------------------ « Envoyer un colis » : photo, destinataire, paiement */

export const SchemaParamsOptionsEnvoi = z.object({
  /** Ville de destination ; absente = la dernière destination de l'expéditeur. */
  ville: z.string().optional(),
});
export type ParamsOptionsEnvoi = z.infer<typeof SchemaParamsOptionsEnvoi>;

/** Un départ qui peut porter le colis. */
export const SchemaOffreDepartColis = z.object({
  departId: SchemaId,
  compagnie: z.string(),
  heureDepart: SchemaIsoDouala,
  /** Où le destinataire retire en mode « gare » : « gare de Bafoussam ». */
  retrait: z.string(),
  arriveePrevue: SchemaIsoDouala,
  /** Port du transport en gare (avant frais, assurance et option). */
  port: SchemaFcfaPositif,
  recommande: z.boolean(),
});
export type OffreDepartColis = z.infer<typeof SchemaOffreDepartColis>;

export const SchemaOffreModeColis = z.object({
  mode: SchemaModeColis,
  detail: z.string(),
  /** Supplément par rapport au retrait en gare (0 pour la gare). */
  supplement: SchemaFcfaPositif,
});

export const SchemaOptionsEnvoiColis = z.object({
  /** Dernier destinataire connu, pour préremplir « Pour qui ? ». */
  suggestion: z
    .object({
      surnom: z.string(),
      telephone: SchemaTelephone,
      destination: z.object({ ville: z.string(), gare: z.string() }),
    })
    .nullable(),
  departs: z.array(SchemaOffreDepartColis),
  modes: z.array(SchemaOffreModeColis),
  /** Assurance proposée : taux, minimum, plafond de la valeur assurée. */
  assurance: z.object({
    tauxPct: z.int().positive(),
    minimum: SchemaFcfaPositif,
    plafondValeur: SchemaFcfaPositif,
    assureur: z.string(),
  }),
  interdits: z.string(),
});
export type OptionsEnvoiColis = z.infer<typeof SchemaOptionsEnvoiColis>;

/** Ce que l'app lit sur la photo du colis. */
export const SchemaEstimationPhoto = z.object({
  photoRef: SchemaRefPhoto,
  taille: z.string(),
  poidsKg: z.number().positive(),
});
export type EstimationPhoto = z.infer<typeof SchemaEstimationPhoto>;

export const SchemaDemandePhoto = z.object({ photoRef: SchemaRefPhoto });

/** Paramètres d'un devis : le port vient du départ choisi. */
export const SchemaDemandeDevisColis = z.object({
  departId: SchemaId,
  mode: SchemaModeColis,
  /** Valeur à assurer ; 0 = pas d'assurance. */
  valeurAssuree: SchemaFcfaPositif,
  /** Prix de la livraison moto (mode `moto`), au minimum 1 000 F. */
  prixLivraison: SchemaFcfaPositif.optional(),
});
export type DemandeDevisColis = z.infer<typeof SchemaDemandeDevisColis>;

export const SchemaDemandeCreationColis = z.object({
  departId: SchemaId,
  photoRef: SchemaRefPhoto,
  destinataire: z.object({
    nom: z.string().min(1),
    telephone: SchemaTelephone,
  }),
  contenu: z.string().min(1),
  poidsKg: z.number().positive(),
  valeurDeclaree: SchemaFcfaPositif,
  assurer: z.boolean(),
  mode: SchemaModeColis,
  /** Obligatoire en mode `relais`. */
  relaisId: SchemaId.optional(),
  /** Obligatoire en mode `moto`. */
  adresseLivraison: z.string().optional(),
  paiement: z.object({
    moyen: SchemaMoyenPaiementColis,
    numero: SchemaTelephone.optional(),
  }),
});
export type DemandeCreationColis = z.infer<typeof SchemaDemandeCreationColis>;

/**
 * Colis créé et payé. Le code de retrait est dans `colis.retrait.code`, à l'expéditeur seulement.
 */
export const SchemaColisCree = z.object({
  colis: SchemaColisProprietaire,
  devis: SchemaDevisColis,
  paiement: z.object({
    reference: z.string(),
    moyen: SchemaMoyenPaiementColis,
    etat: z.enum(["paye", "en_attente"]),
    montant: SchemaFcfaPositif,
  }),
  /** L'étiquette est prête : le voyageur dépose le colis au guichet. */
  etiquettePrete: z.boolean(),
});
export type ColisCree = z.infer<typeof SchemaColisCree>;
