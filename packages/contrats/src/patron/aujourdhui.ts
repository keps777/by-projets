import { z } from "zod";
import { FcfaSchema, IdSchema, IsoDoualaSchema, TauxPctSchema, VariationPctSchema } from "./commun";

/* ----------------------------------------------------------------------- chiffres du jour */

/** Les chiffres du jour d'une compagnie, tels que le patron les suit en direct. */
export const ChiffresDuJourSchema = z.strictObject({
  recette: FcfaSchema,
  variationPct: VariationPctSchema,
  /** Jour de comparaison (« mardi dernier »). */
  comparaison: z.string(),
  billets: z.number().int().nonnegative(),
  colis: z.number().int().nonnegative(),
  remplissagePct: TauxPctSchema,
  /** Somme des écarts de caisse du jour (négative = il manque de l'argent). */
  ecartTotal: FcfaSchema,
});
export type ChiffresDuJour = z.infer<typeof ChiffresDuJourSchema>;

/** Accueil du patron (`/(patron)/aujourdhui`). */
export const TableauDuJourSchema = z.strictObject({
  compagnie: z.string(),
  patron: z.string(),
  nbGares: z.number().int(),
  nbBus: z.number().int(),
  nbPersonnes: z.number().int(),
  instant: IsoDoualaSchema,
  jour: ChiffresDuJourSchema,
  assistant: z.strictObject({
    nbInsights: z.number().int().nonnegative(),
    apercus: z.array(z.string()),
  }),
  nbAlertes: z.number().int().nonnegative(),
});
export type TableauDuJour = z.infer<typeof TableauDuJourSchema>;

/* ----------------------------------------------------------------------- alertes */

export const CategorieAlerteSchema = z.enum([
  "ecart_caisse",
  "correspondance",
  "pin_bloque",
  "panne_bus",
  "momo_sans_correspondance",
  "financement",
  "autre",
]);
export type CategorieAlerte = z.infer<typeof CategorieAlerteSchema>;

export const AlerteSchema = z.strictObject({
  id: IdSchema,
  categorie: CategorieAlerteSchema,
  texte: z.string(),
  quand: IsoDoualaSchema,
  /** Objet concerné (session, personne, bus, dossier…) quand l'alerte ouvre une fiche. */
  cibleId: IdSchema.nullable(),
});
export type Alerte = z.infer<typeof AlerteSchema>;

export const ListeAlertesSchema = z.strictObject({
  alertes: z.array(AlerteSchema),
});
export type ListeAlertes = z.infer<typeof ListeAlertesSchema>;

/* ----------------------------------------------------------------------- temps réel */

/** Messages du canal `patron.direct` : chiffres rafraîchis ou nouvelle alerte. */
export const MessageDirectJourSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("chiffres"),
    instant: IsoDoualaSchema,
    jour: ChiffresDuJourSchema,
  }),
  z.strictObject({ type: z.literal("alerte"), alerte: AlerteSchema }),
]);
export type MessageDirectJour = z.infer<typeof MessageDirectJourSchema>;
