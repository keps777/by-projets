import { z } from "zod";

/**
 * Briques communes des contrats voyageur.
 *
 * - Montants : entiers en FCFA (jamais de décimales, jamais de flottant).
 * - Heures : chaînes ISO 8601 avec le décalage fixe +01:00 de Africa/Douala
 *   (ex. `2027-01-05T08:00:00.000+01:00`) ; jamais d'heure « UTC » (Z) ni d'heure sans fuseau.
 */

export const FUSEAU_VOYAGEUR = "Africa/Douala";

/** Montant en francs CFA : un entier (négatif pour une remise ou un écart). */
export const SchemaFcfa = z.number().int();
export type Fcfa = z.infer<typeof SchemaFcfa>;

/** Montant en francs CFA : un entier positif ou nul. */
export const SchemaFcfaPositif = z.number().int().nonnegative();

/** Instant ISO exprimé à Douala (`+01:00`). Les millisecondes sont facultatives. */
export const SchemaIsoDouala = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/,
    "Instant ISO attendu avec le fuseau Africa/Douala (+01:00)",
  );
export type IsoDouala = z.infer<typeof SchemaIsoDouala>;

/** Jour calendaire `AAAA-MM-JJ` (jour de Douala). */
export const SchemaJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Jour AAAA-MM-JJ attendu");
export type Jour = z.infer<typeof SchemaJour>;

/** Numéro de téléphone au format international sans espace (`+237691221008`). */
export const SchemaTelephone = z.string().regex(/^\+\d{8,15}$/, "Numéro international attendu");
export type Telephone = z.infer<typeof SchemaTelephone>;

export const SchemaId = z.string().min(1);
export type Id = z.infer<typeof SchemaId>;

export const SchemaClasse = z.enum(["classique", "vip"]);
export type Classe = z.infer<typeof SchemaClasse>;

export const SchemaVille = z.object({
  /** Code de la ville (DLA, YDE, BAF…) ; absent pour une ville sans gare. */
  code: z.string().optional(),
  nom: z.string(),
});
export type Ville = z.infer<typeof SchemaVille>;

export const SchemaCompagnieRef = z.object({ id: SchemaId, nom: z.string() });
export type CompagnieRef = z.infer<typeof SchemaCompagnieRef>;

export const SchemaMoyenPaiement = z.enum(["mtn_momo", "orange_money", "carte", "proche"]);
export type MoyenPaiement = z.infer<typeof SchemaMoyenPaiement>;

/** Une ligne d'un devis ou d'un récapitulatif de commande. */
export const SchemaLigneDevis = z.object({
  code: z.string(),
  libelle: z.string(),
  /** Montant réellement dû (0 si la ligne est offerte). */
  montant: SchemaFcfa,
  /** Montant avant remise, quand il est barré à l'écran. */
  montantBarre: SchemaFcfaPositif.optional(),
  /** Code promotionnel qui rend la ligne gratuite (« JOURJ »). */
  offertAvec: z.string().optional(),
});
export type LigneDevis = z.infer<typeof SchemaLigneDevis>;

export const SchemaDevis = z.object({
  lignes: z.array(SchemaLigneDevis),
  total: SchemaFcfa,
});
export type Devis = z.infer<typeof SchemaDevis>;

/** Montant approximatif dans une devise étrangère, en unité mineure (centimes). */
export const SchemaConversion = z.object({
  devise: z.string().length(3),
  montantMineur: z.number().int().nonnegative(),
  approximatif: z.boolean(),
});
export type Conversion = z.infer<typeof SchemaConversion>;
