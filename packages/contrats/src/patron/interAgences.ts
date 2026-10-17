import { z } from "zod";
import { FcfaSchema, HeureSchema, IdSchema, IsoDoualaSchema, JourSchema } from "./commun";

/** Colis entre compagnies (`/(patron)/inter-agences`) : deux tronçons, deux compagnies payées. */

export const TronconColisSchema = z.strictObject({
  rang: z.number().int().positive(),
  compagnie: z.string(),
  origine: z.string(),
  destination: z.string(),
  heureDepart: HeureSchema,
  bus: z.string(),
  heureArrivee: HeureSchema,
  /** Part de la compagnie sur ce tronçon. */
  part: FcfaSchema,
});

export const ReglementEntreCompagniesSchema = z.strictObject({
  autreCompagnie: z.string(),
  /** Ce que l'autre compagnie doit (colis transportés pour elle). */
  nousDoit: FcfaSchema,
  nbColisTransportesPourEux: z.number().int().nonnegative(),
  /** Ce que nous lui devons (colis en correspondance). */
  nousLeDevons: FcfaSchema,
  nbColisEnCorrespondance: z.number().int().nonnegative(),
  /** Solde net, positif si l'autre compagnie nous doit. */
  soldeNet: FcfaSchema,
  /** Règlement par MoMo le lundi à 08:00. */
  reglementA: IsoDoualaSchema,
});

export const InterAgencesSchema = z.strictObject({
  colisEnCorrespondance: z.strictObject({
    colisId: IdSchema,
    numero: z.string(),
    origine: z.string(),
    destination: z.string(),
    poidsKg: z.number().positive(),
    troncons: z.array(TronconColisSchema),
    /** Règle de passage de témoin (scan « remis à » / « reçu »). */
    regle: z.string(),
  }),
  reglement: ReglementEntreCompagniesSchema,
  correspondanceVoyageurs: z.strictObject({
    minutesGaranties: z.number().int().positive(),
    attenteDuSecondBusMinutes: z.number().int().positive(),
  }),
  conventions: z.array(
    z.strictObject({
      id: IdSchema,
      avec: z.string(),
      statut: z.enum(["active", "expiree", "denoncee"]),
    }),
  ),
});
export type InterAgences = z.infer<typeof InterAgencesSchema>;

export const ParamsConventionSchema = z.strictObject({ conventionId: IdSchema });

export const ConventionSchema = z.strictObject({
  id: IdSchema,
  compagnies: z.tuple([z.string(), z.string()]),
  signeeLe: JourSchema,
  renouvellement: z.enum(["trimestriel", "annuel"]),
  statut: z.enum(["active", "expiree", "denoncee"]),
  parts: z.strictObject({
    colisType: z.strictObject({
      poidsKg: z.number().positive(),
      prix: FcfaSchema,
      fraisAfriMove: FcfaSchema,
    }),
    /** `null` : la compagnie n'a pas de part sur ce tronçon. */
    lignes: z.array(
      z.strictObject({
        troncon: z.string(),
        premiere: FcfaSchema.nullable(),
        seconde: FcfaSchema.nullable(),
      }),
    ),
    total: z.strictObject({ premiere: FcfaSchema, seconde: FcfaSchema }),
  }),
  regles: z.array(
    z.strictObject({ rang: z.number().int().positive(), titre: z.string(), texte: z.string() }),
  ),
  signatures: z.array(
    z.strictObject({ compagnie: z.string(), signataire: z.string(), signeA: IsoDoualaSchema }),
  ),
  trimestre: z.strictObject({
    colisEchanges: z.number().int().nonnegative(),
    litiges: z.number().int().nonnegative(),
    netRecu: FcfaSchema,
    reglements: z.number().int().nonnegative(),
  }),
});
export type Convention = z.infer<typeof ConventionSchema>;
