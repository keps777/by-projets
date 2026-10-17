import { z } from "zod";
import {
  AccuseSigneSchema,
  FcfaPositifSchema,
  IdSchema,
  IsoDoualaSchema,
  commandeSignee,
} from "./commun";

/**
 * Financement : AfriMove ne prête pas et ne touche pas l'argent, il présente le dossier au
 * partenaire financier et exécute le prélèvement convenu.
 */

export const ConditionsAvanceSchema = z.strictObject({
  /** Part des ventes MoMo prélevée pour rembourser, en %. */
  remboursementPctVentesMomo: z.number().int().min(1).max(100),
  dureeEstimeeSemaines: z.number().int().positive(),
  /** Coût total en % : fixé par le partenaire, donc `null` tant qu'il n'a pas répondu. */
  coutTotalPct: z.number().nonnegative().nullable(),
});

export const OffreFinancementSchema = z.strictObject({
  /** Nom du partenaire ; `null` tant que la convention n'est pas signée. */
  partenaire: z.string().nullable(),
  conventionSignee: z.boolean(),
  avance: z.strictObject({
    statut: z.enum(["eligible", "non_eligible", "en_cours"]),
    plafond: FcfaPositifSchema,
    equivalentJoursDeVentes: z.number().int().positive(),
    montantPropose: FcfaPositifSchema,
    conditions: ConditionsAvanceSchema,
    versementSousHeures: z.number().int().positive(),
  }),
  creditMateriel: z.strictObject({
    description: z.string(),
    montantTotal: FcfaPositifSchema,
    mensualites: z.number().int().positive(),
    montantMensualite: FcfaPositifSchema,
  }),
  paie: z.strictObject({
    nbSalaires: z.number().int(),
    jourDeVersement: z.string(),
  }),
  billetEnDeuxFois: z.strictObject({
    actif: z.boolean(),
    exemple: z.strictObject({
      prixBillet: FcfaPositifSchema,
      reservation: FcfaPositifSchema,
      veille: FcfaPositifSchema,
    }),
  }),
});
export type OffreFinancement = z.infer<typeof OffreFinancementSchema>;

/* ----------------------------------------------------------------------- dossier */

export const StatutDossierSchema = z.enum(["envoye", "en_analyse", "verse", "refuse", "retire"]);
export type StatutDossier = z.infer<typeof StatutDossierSchema>;

export const PieceDossierSchema = z.strictObject({
  nom: z.string(),
  detail: z.string(),
  format: z.enum(["pdf", "csv"]),
});

export const EtapeSuiviSchema = z.strictObject({
  code: z.enum(["envoye", "analyse", "versement"]),
  libelle: z.string(),
  detail: z.string(),
  at: IsoDoualaSchema.nullable(),
  etat: z.enum(["fait", "en_cours", "a_venir"]),
});

export const DossierFinancementSchema = z.strictObject({
  id: z.string().regex(/^AV-\d{4}-\d{4}$/),
  produit: z.literal("avance"),
  statut: StatutDossierSchema,
  partenaire: z.string().nullable(),
  montant: FcfaPositifSchema,
  envoyeA: IsoDoualaSchema,
  reponseAvant: IsoDoualaSchema,
  conditions: ConditionsAvanceSchema,
  pieces: z.array(PieceDossierSchema),
  suivi: z.array(EtapeSuiviSchema),
  /** Le patron peut retirer la demande tant qu'elle n'est pas versée. */
  retirable: z.boolean(),
});
export type DossierFinancement = z.infer<typeof DossierFinancementSchema>;

export const ParamsDossierSchema = z.strictObject({ dossierId: z.string().min(1) });

/** Demander l'avance : le mandat de prélèvement est signé par le PIN. */
export const DemanderAvanceSchema = commandeSignee({
  montant: FcfaPositifSchema,
});
export type DemanderAvance = z.infer<typeof DemanderAvanceSchema>;

export const AvanceDemandeeSchema = AccuseSigneSchema.extend({
  dossier: DossierFinancementSchema,
});
export type AvanceDemandee = z.infer<typeof AvanceDemandeeSchema>;

export const RetirerDemandeSchema = commandeSignee({ dossierId: IdSchema });
export type RetirerDemande = z.infer<typeof RetirerDemandeSchema>;

export const DemandeRetireeSchema = AccuseSigneSchema.extend({
  dossier: DossierFinancementSchema,
});
export type DemandeRetiree = z.infer<typeof DemandeRetireeSchema>;
