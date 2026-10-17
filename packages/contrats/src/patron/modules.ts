import { z } from "zod";
import { AccuseSigneSchema, IdSchema, commandeSignee } from "./commun";

/** Où une activation s'applique : toute l'agence, une gare ou une ville. */
export const PorteeModuleSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("agence") }),
  z.strictObject({ type: z.literal("gare"), id: IdSchema }),
  z.strictObject({ type: z.literal("ville"), nom: z.string().min(1) }),
]);
export type PorteeModule = z.infer<typeof PorteeModuleSchema>;

/** Une exception à l'état de l'agence (module allumé seulement à Douala, éteint à Mvan…). */
export const ExceptionModuleSchema = z.strictObject({
  portee: PorteeModuleSchema,
  actif: z.boolean(),
});

export const ModuleAgenceSchema = z.strictObject({
  code: z.string().min(1),
  nom: z.string(),
  /** État de l'agence (la règle générale). */
  actif: z.boolean(),
  /** Un module « socle » ne peut jamais être éteint. */
  socle: z.boolean(),
  /** Phrase d'état (« paiement en ligne actif · sièges visibles »). */
  detail: z.string(),
  exceptions: z.array(ExceptionModuleSchema),
});
export type ModuleAgence = z.infer<typeof ModuleAgenceSchema>;

/** Les 12 modules (`/(patron)/reglages/modules`). */
export const ModulesAgenceSchema = z.strictObject({
  modules: z.array(ModuleAgenceSchema),
  actifs: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type ModulesAgence = z.infer<typeof ModulesAgenceSchema>;

/** Allumer ou masquer un module, pour l'agence, une gare ou une ville. Signé par le PIN. */
export const ChangerModuleSchema = commandeSignee({
  code: z.string().min(1),
  actif: z.boolean(),
  portee: PorteeModuleSchema,
});
export type ChangerModule = z.infer<typeof ChangerModuleSchema>;

export const ModuleChangeSchema = AccuseSigneSchema.extend({
  module: ModuleAgenceSchema,
});
export type ModuleChange = z.infer<typeof ModuleChangeSchema>;
