import { z } from "zod";
import {
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaMoyenPaiementColis,
  SchemaTelephone,
  SchemaTelephoneMasque,
} from "./commun";

/* ------------------------------------------------------------------ vendeur ambulant */

/**
 * Espace du vendeur ambulant : il vend des billets à ses voisins et touche une commission. Il ne
 * garde jamais d'argent : le voisin paie, le vendeur règle l'agence par MoMo dans la minute.
 */
export const SchemaEspaceVendeur = z.object({
  vendeur: z.object({
    id: SchemaId,
    nom: z.string(),
    /** « V-0412 » */
    numero: z.string(),
    quartier: z.string(),
    /** Compagnies qui ont agréé le vendeur. */
    compagnies: z.array(z.string()),
  }),
  /** Commission par billet quand la compagnie n'en fixe pas d'autre (100 F). */
  commissionParDefaut: SchemaFcfaPositif,
  bilan: z.object({
    billetsDuMois: z.int().nonnegative(),
    gainDuMois: SchemaFcfaPositif,
    /** Jour de versement de la commission (le lundi). */
    versement: z.string(),
    clients: z.int().nonnegative(),
    clientsReguliers: z.int().nonnegative(),
  }),
  regle: z.string(),
});
export type EspaceVendeur = z.infer<typeof SchemaEspaceVendeur>;

export const SchemaParamsDepartsVendeur = z.object({
  /** Jour de départ AAAA-MM-JJ ; absent = demain. */
  jour: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  origine: z.string().optional(),
  destination: z.string().optional(),
});
export type ParamsDepartsVendeur = z.infer<typeof SchemaParamsDepartsVendeur>;

export const SchemaDepartVendeur = z.object({
  departId: SchemaId,
  compagnie: z.string(),
  classe: z.enum(["classique", "vip"]),
  heureDepart: SchemaIsoDouala,
  placesLibres: z.int().nonnegative(),
  prix: SchemaFcfaPositif,
  commission: SchemaFcfaPositif,
});
export type DepartVendeur = z.infer<typeof SchemaDepartVendeur>;

export const SchemaDepartsVendeur = z.object({
  trajet: z.string(),
  jour: z.string(),
  commissionLibelle: z.string(),
  departs: z.array(SchemaDepartVendeur),
  detailPaiement: z.string(),
});
export type DepartsVendeur = z.infer<typeof SchemaDepartsVendeur>;

export const SchemaClientVendeur = z.object({
  nom: z.string(),
  /** Destination habituelle (« Yaoundé »). */
  destination: z.string(),
  /** « chaque vendredi » quand le client voyage à jour fixe. */
  habitude: z.string().nullable(),
  telephoneMasque: SchemaTelephoneMasque,
  /** Proposition de revente en une touche (« vendredi 08:30 »). */
  proposition: z.string().nullable(),
  dernierVoyage: SchemaIsoDouala.nullable(),
});
export type ClientVendeur = z.infer<typeof SchemaClientVendeur>;

export const SchemaClientsVendeur = z.object({
  titre: z.string(),
  clients: z.array(SchemaClientVendeur),
});
export type ClientsVendeur = z.infer<typeof SchemaClientsVendeur>;

/** Vente d'un billet à un voisin : le billet est à son nom, pas à celui du vendeur. */
export const SchemaVenteVendeur = z.object({
  departId: SchemaId,
  voisin: z.object({ nom: z.string().min(1), telephone: SchemaTelephone }),
  /** Moyen avec lequel le vendeur règle l'agence dans la minute. */
  reglementAgence: SchemaMoyenPaiementColis,
});
export type VenteVendeur = z.infer<typeof SchemaVenteVendeur>;

export const SchemaBilletVendu = z.object({
  billetId: SchemaId,
  numero: z.string(),
  departId: SchemaId,
  prix: SchemaFcfaPositif,
  commission: SchemaFcfaPositif,
  /** Montant à régler à l'agence : le prix du billet. */
  aRegler: SchemaFcfaPositif,
  smsEnvoyeA: SchemaTelephoneMasque,
  venduLe: SchemaIsoDouala,
});
export type BilletVendu = z.infer<typeof SchemaBilletVendu>;
