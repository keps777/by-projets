import { z } from "zod";
import {
  FcfaPositifSchema,
  FcfaSchema,
  HeureSchema,
  IdSchema,
  IsoDoualaSchema,
  JourSchema,
  TauxPctSchema,
  VariationPctSchema,
} from "./commun";

/** Salle de contrôle (route `/controle`, 1280 px) : le direct des gares de la compagnie. */

export const ChiffresControleSchema = z.strictObject({
  recette: FcfaSchema,
  variationPct: VariationPctSchema,
  billets: z.number().int().nonnegative(),
  billetsEnLigne: z.number().int().nonnegative(),
  billetsEnRoute: z.number().int().nonnegative(),
  colis: z.number().int().nonnegative(),
  colisEnCorrespondance: z.number().int().nonnegative(),
  litiges: z.number().int().nonnegative(),
  remplissagePct: TauxPctSchema,
  departs: z.number().int().nonnegative(),
  departsFusionnes: z.number().int().nonnegative(),
  ecartsDeCaisse: z.strictObject({
    total: FcfaSchema,
    caissesEnEcart: z.number().int().nonnegative(),
    caisses: z.number().int().nonnegative(),
  }),
});
export type ChiffresControle = z.infer<typeof ChiffresControleSchema>;

export const GareControleSchema = z.strictObject({
  gareId: IdSchema,
  nom: z.string(),
  billets: z.number().int().nonnegative(),
  colis: z.number().int().nonnegative(),
  cashAttendu: FcfaPositifSchema,
  ecart: FcfaSchema,
  prochainDepart: z
    .strictObject({
      heure: HeureSchema,
      destination: z.string(),
      remplis: z.number().int().nonnegative(),
      capacite: z.number().int().positive(),
    })
    .nullable(),
  superviseur: z.strictObject({
    nom: z.string(),
    enLigne: z.boolean(),
    horsLigneDepuisMinutes: z.number().int().positive().nullable(),
  }),
});

export type GareControle = z.infer<typeof GareControleSchema>;

export const ATraiterSchema = z.strictObject({
  id: IdSchema,
  type: z.enum(["cloture_en_attente", "bus_arrete", "correspondance", "proposition_assistant"]),
  texte: z.string(),
  quand: IsoDoualaSchema,
});

export type ATraiter = z.infer<typeof ATraiterSchema>;

export const SalleDeControleSchema = z.strictObject({
  compagnie: z.string(),
  jour: JourSchema,
  instant: IsoDoualaSchema,
  nbGares: z.number().int(),
  nbBus: z.number().int(),
  synchro: z.strictObject({
    garesSynchronisees: z.number().int(),
    gares: z.number().int(),
  }),
  chiffres: ChiffresControleSchema,
  carte: z.strictObject({
    busEnRoute: z.number().int().nonnegative(),
    /** Villes repérées sur la carte, avec leur effectif de guichets. */
    villes: z.array(z.string()),
    alerte: z
      .strictObject({
        immatriculation: z.string(),
        arretMinutes: z.number().int().nonnegative(),
        soupcon: z.enum(["panne", "retard", "autre"]),
      })
      .nullable(),
  }),
  gares: z.array(GareControleSchema),
  aTraiter: z.array(ATraiterSchema),
  ventesParHeure: z.strictObject({
    /** Une barre par heure ; `prevu` pour les heures qui n'ont pas encore eu lieu. */
    heures: z.array(
      z.strictObject({
        heure: z.number().int().min(0).max(23),
        montant: FcfaPositifSchema,
        prevu: z.boolean(),
      }),
    ),
    previsionCloture: FcfaPositifSchema,
    lecture: z.string(),
  }),
  rapport: z.strictObject({
    envoiA: IsoDoualaSchema,
    destinataires: z.strictObject({ patron: z.string(), superviseurs: z.number().int() }),
    caissesAValider: z.number().int().nonnegative(),
  }),
});
export type SalleDeControle = z.infer<typeof SalleDeControleSchema>;

/** Messages du canal `controle.direct`. */
export const MessageDirectControleSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("chiffres"),
    instant: IsoDoualaSchema,
    chiffres: ChiffresControleSchema,
  }),
  z.strictObject({ type: z.literal("gare"), instant: IsoDoualaSchema, gare: GareControleSchema }),
  z.strictObject({ type: z.literal("a_traiter"), element: ATraiterSchema }),
]);
export type MessageDirectControle = z.infer<typeof MessageDirectControleSchema>;
