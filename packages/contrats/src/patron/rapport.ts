import { z } from "zod";
import { FcfaSchema, IdSchema, IsoDoualaSchema, JourSchema, VariationPctSchema } from "./commun";

export const RapportGareSchema = z.strictObject({
  gareId: IdSchema,
  nom: z.string(),
  billets: z.number().int().nonnegative(),
  ecart: FcfaSchema,
  /** Remarques de la gare (« 1 départ fusionné », « soute pleine à 10:00 »…). */
  remarques: z.array(z.string()),
});

/** Rapport du soir (21 h) : le message WhatsApp et sa vue dans l'app (`/(patron)/rapport`). */
export const RapportSoirSchema = z.strictObject({
  jour: JourSchema,
  envoyeA: IsoDoualaSchema,
  titre: z.string(),
  nbGares: z.number().int(),
  chiffres: z.strictObject({
    billets: z.number().int().nonnegative(),
    variationBilletsPct: VariationPctSchema,
    colis: z.number().int().nonnegative(),
    litiges: z.number().int().nonnegative(),
    recette: FcfaSchema,
    cash: FcfaSchema,
    momo: FcfaSchema,
  }),
  gares: z.array(RapportGareSchema),
  enRoute: z.strictObject({
    billetsConvoyeurs: z.number().int().nonnegative(),
    controles: z.number().int().nonnegative(),
    regularisations: z.number().int().nonnegative(),
    texte: z.string(),
  }),
  remplissage: z.strictObject({
    moyenPct: z.number(),
    remarque: z.string().nullable(),
  }),
  annulations: z.strictObject({
    nombre: z.number().int().nonnegative(),
    montant: FcfaSchema,
    toutesAvecPin: z.boolean(),
  }),
  enLigne: z.strictObject({
    billets: z.number().int().nonnegative(),
    partPct: z.number().nonnegative(),
  }),
  /** Superviseurs qui ont signé le rapport. */
  signatures: z.array(z.strictObject({ nom: z.string(), gare: z.string() })),
  /** La question que le rapport suggère de poser à l'assistant, déjà préparée. */
  questionSuggeree: z.strictObject({
    question: z.string(),
    reponse: z.string(),
  }),
});
export type RapportSoir = z.infer<typeof RapportSoirSchema>;

export const ParamsRapportSoirSchema = z.strictObject({
  /** Jour du rapport ; le dernier rapport envoyé par défaut. */
  jour: JourSchema.optional(),
});
export type ParamsRapportSoir = z.infer<typeof ParamsRapportSoirSchema>;
