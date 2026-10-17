import { z } from "zod";
import { SchemaColisPartenaire } from "./colis";
import { SchemaFcfa, SchemaFcfaPositif, SchemaId, SchemaIsoDouala } from "./commun";

/* ------------------------------------------------------------------ colis entre compagnies */

/** Un tronçon d'un colis qui change de bus en route ; chaque compagnie est payée pour le sien. */
export const SchemaTroncon = z.strictObject({
  rang: z.int().positive(),
  compagnie: z.string(),
  trajet: z.string(),
  depart: SchemaIsoDouala,
  bus: z.string(),
  arrivee: SchemaIsoDouala,
  /** Part de la compagnie sur ce tronçon. */
  part: SchemaFcfaPositif,
});
export type Troncon = z.infer<typeof SchemaTroncon>;

export const SchemaColisEnCorrespondance = z.strictObject({
  colis: SchemaColisPartenaire,
  trajet: z.string(),
  troncons: z.array(SchemaTroncon),
  /** Règle de responsabilité : elle passe au scan. */
  regle: z.string(),
});
export type ColisEnCorrespondance = z.infer<typeof SchemaColisEnCorrespondance>;

export const SchemaConventionResumee = z.strictObject({
  id: SchemaId,
  partenaire: z.string(),
  libelle: z.string(),
});

export const SchemaInterAgences = z.strictObject({
  titre: z.string(),
  sousTitre: z.string(),
  colis: z.array(SchemaColisEnCorrespondance),
  conventions: z.array(SchemaConventionResumee),
  voyageurs: z.strictObject({
    titre: z.string(),
    texte: z.string(),
    /** Correspondance garantie, en minutes. */
    correspondanceMinutes: z.int().positive(),
    /** Le second bus attend ce délai avant de partir sans le voyageur. */
    attenteSecondBusMinutes: z.int().positive(),
  }),
});
export type InterAgences = z.infer<typeof SchemaInterAgences>;

/* ------------------------------------------------------------------ règlement hebdomadaire */

export const SchemaCreanceInterAgences = z.strictObject({
  compagnie: z.string(),
  /** `nous_doivent` : la compagnie nous doit ; `nous_devons` : nous lui devons. */
  sens: z.enum(["nous_doivent", "nous_devons"]),
  colis: z.int().nonnegative(),
  montant: SchemaFcfaPositif,
});

export const SchemaReglementHebdo = z
  .strictObject({
    titre: z.string(),
    jour: z.string(),
    creances: z.array(SchemaCreanceInterAgences),
    /** Positif : on nous doit ce solde ; négatif : nous le devons. */
    soldeNet: SchemaFcfa,
    moyen: z.string(),
    /** Règlement le lundi à 08:00 par MoMo. */
    reglementLe: SchemaIsoDouala,
    /** Contestation possible jusqu'au dimanche 20:00. */
    contestationJusqua: SchemaIsoDouala,
  })
  .refine(
    (r) =>
      r.creances.reduce((s, c) => s + (c.sens === "nous_doivent" ? c.montant : -c.montant), 0) ===
      r.soldeNet,
    { message: "Le solde net doit être la somme des créances" },
  );
export type ReglementHebdo = z.infer<typeof SchemaReglementHebdo>;

export const SchemaContestationReglement = z.object({
  motif: z.string().min(1).max(1000),
  colisIds: z.array(SchemaId).optional(),
});
export const SchemaContestationEnregistree = z.strictObject({
  reference: z.string(),
  deposeeLe: SchemaIsoDouala,
  /** Vrai si la contestation arrive avant la limite du dimanche 20:00. */
  recevable: z.boolean(),
});

/* ------------------------------------------------------------------ scans de transfert */

export const SchemaScanTransfert = z.object({
  colisId: SchemaId,
  /** « remis à Oméga » (convoyeur qui cède) ou « reçu » (convoyeur qui prend en charge). */
  sens: z.enum(["remis_a", "recu"]),
  /** La compagnie qui prend le colis en charge. */
  compagnie: z.string().min(1),
  lieu: z.string().optional(),
});
export type ScanTransfert = z.infer<typeof SchemaScanTransfert>;

export const SchemaTransfertEnregistre = z.strictObject({
  colis: SchemaColisPartenaire,
  sens: z.enum(["remis_a", "recu"]),
  compagnie: z.string(),
  scanneLe: SchemaIsoDouala,
  /** La responsabilité passe au scan : elle reste au cédant jusqu'au scan « reçu », puis au preneur. */
  responsable: z.enum(["cedant", "preneur"]),
});
export type TransfertEnregistre = z.infer<typeof SchemaTransfertEnregistre>;

/* ------------------------------------------------------------------ convention */

export const SchemaPartsTroncons = z.strictObject({
  titre: z.string(),
  aide: z.string(),
  entetes: z.array(z.string()),
  /** `null` quand la compagnie n'a pas de part sur la ligne (« — »). */
  lignes: z.array(
    z.strictObject({
      troncon: z.string(),
      parts: z.record(z.string(), SchemaFcfaPositif.nullable()),
    }),
  ),
  total: z.strictObject({
    libelle: z.string(),
    prixClient: SchemaFcfaPositif,
    fraisAfrimove: SchemaFcfaPositif,
    parts: z.record(z.string(), SchemaFcfaPositif),
  }),
});

export const SchemaConvention = z.strictObject({
  id: SchemaId,
  titre: z.string(),
  signeLe: SchemaIsoDouala,
  renouvellement: z.string(),
  statut: z.enum(["active", "suspendue", "resiliee"]),
  parts: SchemaPartsTroncons,
  regles: z.strictObject({
    titre: z.string(),
    liste: z.array(
      z.strictObject({ rang: z.int().positive(), titre: z.string(), texte: z.string() }),
    ),
  }),
  signatures: z.array(
    z.strictObject({
      compagnie: z.string(),
      /** Nom affiché du signataire (« Toi » pour le patron connecté). */
      signataire: z.string(),
      moi: z.boolean(),
      signeLe: SchemaIsoDouala,
      parPin: z.literal(true),
    }),
  ),
  trimestre: z.strictObject({
    colisEchanges: z.int().nonnegative(),
    litiges: z.int().nonnegative(),
    delaiLitigeJours: z.int().nonnegative().nullable(),
    netRecu: SchemaFcfa,
    lundis: z.int().nonnegative(),
  }),
  pied: z.string(),
});
export type Convention = z.infer<typeof SchemaConvention>;

export const SchemaParamsConvention = z.object({ conventionId: SchemaId });

export const SchemaInvitationCompagnie = z.object({
  compagnie: z.string().min(1),
  /** Téléphone du patron de la compagnie invitée. */
  patron: z.string().min(1),
});
export const SchemaInvitationCompagnieEnvoyee = z.strictObject({
  reference: z.string(),
  envoyeeLe: SchemaIsoDouala,
});
