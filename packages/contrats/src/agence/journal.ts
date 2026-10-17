import { z } from "zod";
import {
  SchemaId,
  SchemaIsoDouala,
  SchemaPersonneRef,
  SchemaUuid,
  SchemaValidationSuperviseur,
} from "./commun";
import { SchemaCibleEvenement, SchemaNumeroPlage } from "./evenements";

/**
 * Le journal signé : tout ce qui se passe est un événement horodaté, ajouté, jamais effacé. Chaque
 * entrée est chaînée à la précédente par son empreinte : retirer ou modifier une entrée casse la
 * chaîne, ce que `chaineValide` signale.
 */

export const SchemaEntreeJournal = z.object({
  /** L'identifiant de l'événement, créé sur l'appareil. */
  evenementId: SchemaUuid,
  type: z.string().min(1),
  at: SchemaIsoDouala,
  auteur: SchemaPersonneRef,
  appareilId: SchemaId.nullable(),
  cible: SchemaCibleEvenement,
  numeroPlage: SchemaNumeroPlage.nullable(),
  /** Ce qui s'est passé, en une phrase lisible : « Annulation du billet 0171 ». */
  resume: z.string().min(1),
  /** Le superviseur qui a validé avec son PIN, quand l'événement l'exigeait. */
  validePar: SchemaValidationSuperviseur.nullable(),
  /** Empreinte de cette entrée (hexadécimale). */
  empreinte: z.string().regex(/^[0-9a-f]{8,}$/),
  /** Empreinte de l'entrée précédente ; null pour la première du journal. */
  precedente: z
    .string()
    .regex(/^[0-9a-f]{8,}$/)
    .nullable(),
});
export type EntreeJournal = z.infer<typeof SchemaEntreeJournal>;

export const SchemaParamsJournal = z.object({
  /** Journal d'une personne (« Voir son journal »). */
  personneId: SchemaId.optional(),
  /** Journal d'une session de caisse. */
  sessionId: SchemaId.optional(),
  /** AAAA-MM-JJ ; aujourd'hui par défaut. */
  jour: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Curseur renvoyé par la page précédente. */
  apres: z.string().optional(),
  limite: z.number().int().min(1).max(200).optional(),
});
export type ParamsJournal = z.infer<typeof SchemaParamsJournal>;

export const SchemaJournal = z.object({
  entrees: z.array(SchemaEntreeJournal),
  /** Curseur de la page suivante ; null à la fin. */
  suivant: z.string().nullable(),
  /** Faux si la chaîne d'empreintes est rompue sur les entrées renvoyées. */
  chaineValide: z.boolean(),
});
export type Journal = z.infer<typeof SchemaJournal>;
