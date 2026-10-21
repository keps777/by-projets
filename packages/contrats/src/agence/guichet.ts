import { z } from "zod";
import {
  SchemaDepartResume,
  SchemaFcfa,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaPersonneRef,
  SchemaSynchro,
} from "./commun";

/**
 * Accueil du guichet : tout à une touche (planche « Guichet »). Les compteurs sont ceux de la
 * session de caisse en cours ; `enCaisse` est le cash attendu, en FCFA entiers.
 */
export const SchemaGuichetAccueil = z.object({
  agence: z.object({
    compagnie: z.string().min(1),
    /** Nom court de la gare : « Akwa ». */
    gare: z.string().min(1),
  }),
  guichet: z.object({
    id: SchemaId,
    rang: z.number().int().min(1),
    agent: SchemaPersonneRef,
    /** Null tant que l'agent n'a pas ouvert sa caisse (lot Db : la caisse peut être fermée). */
    caisseOuverteA: SchemaIsoDouala.nullable(),
  }),
  synchro: SchemaSynchro,
  compteurs: z.object({
    billets: z.number().int().min(0),
    colis: z.number().int().min(0),
    colisACharger: z.number().int().min(0),
    enCaisse: SchemaFcfaPositif,
    ecart: SchemaFcfa,
  }),
  /** Le quai du prochain départ : scannés sur capacité. Null quand aucun départ n'est à embarquer. */
  quai: z
    .object({
      departId: SchemaId,
      heureDepart: SchemaIsoDouala,
      destination: z.string().min(1),
      scannes: z.number().int().min(0),
      capacite: z.number().int().min(1),
    })
    .nullable(),
  cadence: z.object({ fileAttente: z.number().int().min(0) }),
  /** Null quand la gare n'a plus de départ à venir. */
  prochainDepart: SchemaDepartResume.extend({ dansMinutes: z.number().int().min(0) }).nullable(),
  /** Le départ suivant, qui ouvre à la vente. */
  prochaineOuverture: SchemaDepartResume.pick({
    departId: true,
    heureDepart: true,
    destination: true,
  }).nullable(),
});
export type GuichetAccueil = z.infer<typeof SchemaGuichetAccueil>;
