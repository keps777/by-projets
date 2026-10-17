import { z } from "zod";
import { SchemaConvention } from "../colis/inter-agences";
import { FcfaSchema, HeureSchema, IdSchema, IsoDoualaSchema } from "./commun";

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

/**
 * Le billet voyageur d'une ligne en correspondance de la convention : d'où il part, par où il passe, où il arrive,
 * et qui le vend puis qui le termine (`GET /inter-agences/correspondances`).
 */
export const TrajetVoyageurCorrespondanceSchema = z.strictObject({
  origine: z.string(),
  via: z.string(),
  destination: z.string(),
  /** La compagnie qui vend le billet et conduit le premier tronçon. */
  premiere: z.string(),
  seconde: z.string(),
});
export type TrajetVoyageurCorrespondance = z.infer<typeof TrajetVoyageurCorrespondanceSchema>;

export const InterAgencesSchema = z.strictObject({
  /** Absent quand aucun colis n'est en correspondance (aucune convention, ou aucun échange en cours). */
  colisEnCorrespondance: z
    .strictObject({
      colisId: IdSchema,
      numero: z.string(),
      origine: z.string(),
      destination: z.string(),
      poidsKg: z.number().positive(),
      troncons: z.array(TronconColisSchema),
      /** Règle de passage de témoin (scan « remis à » / « reçu »). */
      regle: z.string(),
    })
    .optional(),
  reglement: ReglementEntreCompagniesSchema,
  correspondanceVoyageurs: z.strictObject({
    minutesGaranties: z.number().int().positive(),
    attenteDuSecondBusMinutes: z.number().int().positive(),
    /** Absent quand la convention n'a pas de ligne voyageurs : le billet n'a alors pas d'origine à montrer. */
    trajet: TrajetVoyageurCorrespondanceSchema.optional(),
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

/**
 * La convention entre deux compagnies : **un seul contrat**, celui du module colis (`colis.SchemaConvention`,
 * `GET /inter-agences/conventions/:conventionId`). Il a remplacé l'ancienne forme patron, un sous-ensemble qui
 * ne portait ni `moi` (signatures), ni `delaiLitigeJours` (trimestre), ni `pied`, et que l'API ne servait pas.
 */
export const ConventionSchema = SchemaConvention;
export type Convention = z.infer<typeof ConventionSchema>;
