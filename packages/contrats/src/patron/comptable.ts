import { z } from "zod";
import {
  AccuseSigneSchema,
  FcfaSchema,
  IsoDoualaSchema,
  MoisSchema,
  OperateurMomoSchema,
  TauxPctSchema,
  commandeSignee,
} from "./commun";

export const ParamsMoisSchema = z.strictObject({
  /** Mois comptable ; le mois en cours de clôture par défaut. */
  mois: MoisSchema.optional(),
});
export type ParamsMois = z.infer<typeof ParamsMoisSchema>;

/* ----------------------------------------------------------------------- synthèse */

export const IdExportSchema = z.enum([
  "journal_ventes",
  "journal_caisse",
  "annulations",
  "ecritures_syscohada",
  "factures_afrimove",
]);
export type IdExport = z.infer<typeof IdExportSchema>;

export const ExportComptableSchema = z.strictObject({
  id: IdExportSchema,
  nom: z.string(),
  description: z.string(),
  /** Nombre de lignes quand l'export est tabulaire. */
  lignes: z.number().int().nonnegative().nullable(),
  /** `a_jour` : rien à télécharger (factures déjà payées). */
  statut: z.enum(["disponible", "a_jour"]),
});

export const SyntheseComptableSchema = z.strictObject({
  mois: MoisSchema,
  libelle: z.string(),
  /** Jour du mois où le mois est clôturé. */
  jourDeCloture: z.number().int().min(1).max(31),
  moisDisponibles: z.array(z.strictObject({ mois: MoisSchema, libelle: z.string() })),
  statut: z.enum(["ouvert", "cloture"]),
  rapprochement: z.strictObject({
    tauxRapprochePct: TauxPctSchema,
    ventesMomo: z.strictObject({ nombre: z.number().int(), montant: FcfaSchema }),
    recuMarchand: FcfaSchema,
    sansCorrespondance: z.strictObject({
      transactions: z.number().int().nonnegative(),
      montant: FcfaSchema,
    }),
  }),
  exports: z.array(ExportComptableSchema),
  cabinet: z.strictObject({
    /** Adresse masquée (« cabinet@… »). */
    destinataire: z.string(),
    automatique: z.boolean(),
    jourDEnvoi: z.number().int().min(1).max(31),
    derniersEnvoisRecus: z.number().int().nonnegative(),
  }),
});
export type SyntheseComptable = z.infer<typeof SyntheseComptableSchema>;

/* ----------------------------------------------------------------------- aperçu d'un export */

export const ParamsApercuExportSchema = z.strictObject({
  exportId: IdExportSchema,
  mois: MoisSchema.optional(),
});
export type ParamsApercuExport = z.infer<typeof ParamsApercuExportSchema>;

/** Une cellule d'un tableau d'export : texte, entier de FCFA ou vide. */
export const CelluleSchema = z.union([z.string(), z.number().int(), z.null()]);

export const ApercuExportSchema = z.strictObject({
  export: z.strictObject({
    id: IdExportSchema,
    format: z.enum(["XLSX", "CSV", "PDF"]),
    nom: z.string(),
    lignes: z.number().int().nonnegative(),
    colonnes: z.number().int().positive(),
    tailleOctets: z.number().int().nonnegative(),
    genereA: IsoDoualaSchema,
  }),
  onglets: z.array(z.strictObject({ id: z.string(), libelle: z.string() })),
  tableau: z.strictObject({
    colonnes: z.array(z.string()),
    /** Les premières lignes seulement ; `total` dit combien le fichier en contient. */
    lignes: z.array(z.array(CelluleSchema)),
    premiere: z.number().int().positive(),
    derniere: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalMontant: FcfaSchema,
  }),
  /** Le fichier porte l'empreinte AfriMove : toute retouche est détectable. */
  signe: z.boolean(),
});
export type ApercuExport = z.infer<typeof ApercuExportSchema>;

/* ----------------------------------------------------------------------- rapprochement MoMo */

export const CauseRapprochementSchema = z.enum([
  "doublon_paiement",
  "paiement_apres_expiration",
  "scan_depot_manquant",
  "inconnue",
]);
export const ActionRapprochementSchema = z.enum(["rembourser", "rattacher", "demander"]);
export type ActionRapprochement = z.infer<typeof ActionRapprochementSchema>;

export const TransactionSansCorrespondanceSchema = z.strictObject({
  /** Référence opérateur (identifiant de la transaction). */
  reference: z.string(),
  recueA: IsoDoualaSchema,
  telephoneMasque: z.string(),
  operateur: OperateurMomoSchema,
  montant: FcfaSchema,
  cause: CauseRapprochementSchema,
  /** Explication déjà formulée (« Probable : … »). */
  explication: z.string(),
  actionProposee: ActionRapprochementSchema,
  /** Colis ou billet à rattacher quand l'action est « rattacher ». */
  cibleSuggeree: z.string().nullable(),
  /** Décision déjà appliquée (le mois n'est clos que quand toutes le sont). */
  decision: ActionRapprochementSchema.nullable(),
});
export type TransactionSansCorrespondance = z.infer<typeof TransactionSansCorrespondanceSchema>;

export const RapprochementMomoSchema = z.strictObject({
  mois: MoisSchema,
  libelle: z.string(),
  transactions: z.number().int(),
  surTotalVentes: z.number().int(),
  montantTotal: FcfaSchema,
  partPct: z.number().nonnegative(),
  lignes: z.array(TransactionSansCorrespondanceSchema),
});
export type RapprochementMomo = z.infer<typeof RapprochementMomoSchema>;

export const DecisionRapprochementSchema = z.strictObject({
  reference: z.string(),
  action: ActionRapprochementSchema,
});

/** Appliquer les décisions du rapprochement : rembourse, rattache, réclame. Signé par le PIN. */
export const AppliquerRapprochementSchema = commandeSignee({
  mois: MoisSchema,
  decisions: z.array(DecisionRapprochementSchema).min(1),
});
export type AppliquerRapprochement = z.infer<typeof AppliquerRapprochementSchema>;

export const RapprochementAppliqueSchema = AccuseSigneSchema.extend({
  mois: MoisSchema,
  remboursements: z.number().int().nonnegative(),
  rattachements: z.number().int().nonnegative(),
  reclamations: z.number().int().nonnegative(),
  /** Restent-ils des lignes ouvertes ? Le mois ne peut pas être clôturé tant que oui. */
  lignesOuvertes: z.number().int().nonnegative(),
});
export type RapprochementApplique = z.infer<typeof RapprochementAppliqueSchema>;

/* ----------------------------------------------------------------------- clôture */

export const FichierClotureSchema = z.strictObject({
  id: IdExportSchema,
  nom: z.string(),
  description: z.string(),
  format: z.enum(["xlsx", "csv", "pdf"]),
  tailleOctets: z.number().int().nonnegative().nullable(),
  pages: z.number().int().positive().nullable(),
});

export const ClotureMoisSchema = z.strictObject({
  mois: MoisSchema,
  libelle: z.string(),
  statut: z.enum(["ouvert", "cloture"]),
  clotureA: IsoDoualaSchema.nullable(),
  encaisse: z.strictObject({
    total: FcfaSchema,
    cash: FcfaSchema,
    momo: FcfaSchema,
    ecart: FcfaSchema,
  }),
  /** Le mois est verrouillé : plus que des écritures du mois suivant. */
  verrouille: z.boolean(),
  envoi: z.strictObject({
    destinataire: z.string(),
    recuA: IsoDoualaSchema.nullable(),
    fichiers: z.array(FichierClotureSchema),
  }),
  /** Premières lignes (CSV brut) du journal des ventes envoyé. */
  apercuJournal: z.array(z.string()),
});
export type ClotureMois = z.infer<typeof ClotureMoisSchema>;

/** Clôturer le mois et tout envoyer au cabinet : irréversible, signé par le PIN. */
export const CloturerMoisSchema = commandeSignee({
  mois: MoisSchema,
  envoyerAuCabinet: z.boolean(),
});
export type CloturerMois = z.infer<typeof CloturerMoisSchema>;

export const MoisClotureSchema = AccuseSigneSchema.extend({
  cloture: ClotureMoisSchema,
});
export type MoisCloture = z.infer<typeof MoisClotureSchema>;
