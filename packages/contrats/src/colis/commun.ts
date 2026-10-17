import { ETATS_COLIS } from "@afrimove/domain";
import type { ModeColis } from "@afrimove/domain";
import { z } from "zod";

/**
 * Briques communes des contrats colis et partenaires.
 *
 * - Montants : entiers en FCFA (jamais de décimale).
 * - Heures : chaînes ISO exprimées en Africa/Douala, décalage fixe +01:00.
 */

/** Montant en FCFA : un entier sûr. Peut être négatif quand il s'agit d'un solde. */
export const SchemaFcfa = z.int();
export type Montant = z.infer<typeof SchemaFcfa>;

/** Montant positif ou nul (un prix, un gain). */
export const SchemaFcfaPositif = z.int().min(0);

/** Instant ISO en heure de Douala : `2027-01-05T07:38:00.000+01:00` (millisecondes facultatives). */
export const SchemaIsoDouala = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/, "ISO Africa/Douala (+01:00)");
export type InstantDouala = z.infer<typeof SchemaIsoDouala>;

export const SchemaId = z.string().min(1);

/** Téléphone complet, format international : `+237699401822`. */
export const SchemaTelephone = z.string().regex(/^\+\d{8,15}$/);

/** Téléphone tel que le montrent les écrans partenaires : `6 71 …`. Jamais le numéro complet. */
export const SchemaTelephoneMasque = z.string().min(1);

/** Code de retrait d'un colis : 6 chiffres. N'apparaît que dans les réponses destinées à l'expéditeur et au destinataire. */
export const SchemaCodeRetrait = z.string().regex(/^\d{6}$/);

/** Référence opaque d'une photo déjà téléversée (colis déposé, façade, remise). */
export const SchemaRefPhoto = z.string().min(1);

export const MODES_COLIS = ["gare", "relais", "moto"] as const satisfies readonly ModeColis[];
export const SchemaModeColis = z.enum(MODES_COLIS);

export const SchemaEtatColis = z.enum(ETATS_COLIS);

export const SchemaNote = z.number().min(0).max(5);

export const SchemaLigneDevis = z.object({
  code: z.string(),
  libelle: z.string(),
  montant: SchemaFcfa,
});

/** Devis d'un colis : chaque ligne détaillée, le total est la somme exacte des lignes. */
export const SchemaDevisColis = z
  .object({
    lignes: z.array(SchemaLigneDevis),
    total: SchemaFcfa,
  })
  .refine((d) => d.lignes.reduce((s, l) => s + l.montant, 0) === d.total, {
    message: "Le total doit être la somme des lignes",
  });
export type DevisColis = z.infer<typeof SchemaDevisColis>;

export const MOYENS_PAIEMENT_COLIS = ["mtn_momo", "orange_money", "carte"] as const;
export const SchemaMoyenPaiementColis = z.enum(MOYENS_PAIEMENT_COLIS);
export type MoyenPaiementColis = z.infer<typeof SchemaMoyenPaiementColis>;
