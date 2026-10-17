import { z } from "zod";
import { SchemaColisPartenaire } from "./colis";
import {
  SchemaCodeRetrait,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaNote,
  SchemaRefPhoto,
} from "./commun";

/* ------------------------------------------------------------------ côté voyageur : trouver et choisir un point relais */

export const SchemaParamsRelaisProches = z.object({
  colisId: SchemaId,
  /** Recherche libre (nom, quartier). */
  q: z.string().optional(),
});
export type ParamsRelaisProches = z.infer<typeof SchemaParamsRelaisProches>;

export const SchemaPointRelais = z.object({
  id: SchemaId,
  rang: z.int().positive(),
  nom: z.string(),
  ouvert: z.boolean(),
  /** Heure de fermeture aujourd'hui quand elle approche (« ferme à 19 h »). */
  fermeLe: SchemaIsoDouala.nullable(),
  /** Distance au domicile du destinataire (ou à la gare), en mètres. */
  distanceM: z.int().nonnegative(),
  horaires: z.string(),
  jours: z.string().nullable(),
  note: SchemaNote,
  colisRemis: z.int().nonnegative().nullable(),
  /** Frigo pour médicaments, petit colis seulement… */
  particularite: z.string().nullable(),
  /** Supplément payé par l'expéditeur pour ce mode : 300 F. */
  supplement: SchemaFcfaPositif,
});
export type PointRelais = z.infer<typeof SchemaPointRelais>;

export const SchemaRelaisProches = z.object({
  ville: z.string(),
  /** Repères de la carte, dans l'ordre : points relais numérotés, domicile, gare. */
  reperes: z.array(
    z.object({
      type: z.enum(["relais", "destinataire", "gare", "marche"]),
      libelle: z.string(),
      rang: z.int().positive().nullable(),
    }),
  ),
  /** Le destinataire tel que l'expéditeur le nomme (« Maman »). */
  destinataire: z.object({ surnom: z.string() }),
  relais: z.array(SchemaPointRelais),
  /** Invitation à devenir point relais : part reversée au commerçant par colis. */
  devenir: z.object({ partParColis: SchemaFcfaPositif, detail: z.string(), titre: z.string() }),
});
export type RelaisProches = z.infer<typeof SchemaRelaisProches>;

export const SchemaChoixRelais = z.object({ colisId: SchemaId, relaisId: SchemaId });
export type ChoixRelais = z.infer<typeof SchemaChoixRelais>;

export const SchemaRelaisChoisi = z.object({
  colisId: SchemaId,
  relais: z.object({ id: SchemaId, nom: z.string() }),
  supplement: SchemaFcfaPositif,
  destinatairePrevenu: z.boolean(),
});
export type RelaisChoisi = z.infer<typeof SchemaRelaisChoisi>;

/* ------------------------------------------------------------------ côté relais : l'app du point relais */

/** Un colis en garde chez le relais. */
export const SchemaColisEnGarde = z.strictObject({
  colis: SchemaColisPartenaire,
  depuisJours: z.int().nonnegative(),
  joursRestants: z.int().nonnegative(),
  /** Rappel envoyé au destinataire (à partir du 5e jour). */
  rappelEnvoye: z.boolean(),
});

/** Espace du point relais. Aucune donnée de cette réponse ne contient de code de retrait. */
export const SchemaEspaceRelais = z.strictObject({
  boutique: z.strictObject({
    id: SchemaId,
    nom: z.string(),
    detail: z.string(),
    ouvert: z.boolean(),
    note: SchemaNote,
  }),
  resume: z.strictObject({
    enGarde: z.int().nonnegative(),
    capacite: z.int().positive(),
    arrivent: z.strictObject({ nombre: z.int().nonnegative(), vers: SchemaIsoDouala.nullable() }),
    semaine: z.strictObject({
      gain: SchemaFcfaPositif,
      remis: z.int().nonnegative(),
      versement: z.strictObject({ jour: z.string(), moyen: z.string() }),
    }),
  }),
  /** Gain par colis remis (200 F). */
  gainParRemise: SchemaFcfaPositif,
  remiseEnCours: z
    .strictObject({
      colis: SchemaColisPartenaire,
      /** Consignes à suivre pendant la remise (pièce vue mais jamais photographiée…). */
      consigne: z.string(),
    })
    .nullable(),
  enGarde: z.array(SchemaColisEnGarde),
  /** Les colis sont repris au bout de 7 jours. */
  gardeJours: z.int().positive(),
});
export type EspaceRelais = z.infer<typeof SchemaEspaceRelais>;

export const SchemaParamsColisRelais = z.object({ colisId: SchemaId });

export const SchemaReceptionColisRelais = z.object({
  /** Numéro lu sur l'étiquette scannée. */
  numeroColis: z.string().min(1),
});
export type ReceptionColisRelais = z.infer<typeof SchemaReceptionColisRelais>;

export const SchemaColisRecuRelais = z.strictObject({
  colis: SchemaColisPartenaire,
  recuLe: SchemaIsoDouala,
});
export type ColisRecuRelais = z.infer<typeof SchemaColisRecuRelais>;

/**
 * Remise au destinataire : le relais envoie le code que le client lui a donné, après avoir vu la
 * pièce (sans la photographier), et la photo du colis remis. Le serveur compare au haché.
 */
export const SchemaRemiseColisRelais = z.object({
  colisId: SchemaId,
  code: SchemaCodeRetrait,
  pieceVerifiee: z.literal(true),
  photoRef: SchemaRefPhoto,
});
export type RemiseColisRelais = z.infer<typeof SchemaRemiseColisRelais>;

export const SchemaColisRemisRelais = z.strictObject({
  colis: SchemaColisPartenaire,
  remisLe: SchemaIsoDouala,
  gain: SchemaFcfaPositif,
});
export type ColisRemisRelais = z.infer<typeof SchemaColisRemisRelais>;
