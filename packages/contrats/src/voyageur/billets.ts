import { z } from "zod";
import {
  SchemaClasse,
  SchemaCompagnieRef,
  SchemaConversion,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaLigneDevis,
  SchemaMoyenPaiement,
  SchemaTelephone,
  SchemaVille,
} from "./commun";

/* ------------------------------------------------------------------ commande */

export const SchemaStatutCommande = z.enum(["en_attente_paiement", "payee", "expiree", "annulee"]);
export type StatutCommande = z.infer<typeof SchemaStatutCommande>;

export const SchemaTypeCommande = z.enum(["billet", "covoiturage", "groupe", "proche"]);
export type TypeCommande = z.infer<typeof SchemaTypeCommande>;

export const SchemaCommande = z.object({
  id: SchemaId,
  type: SchemaTypeCommande,
  /** « Covoiturage Samuel · Douala → Kribi · 08:30 » */
  libelle: z.string(),
  lignes: z.array(SchemaLigneDevis),
  /** Total à payer, en FCFA entiers. */
  total: SchemaFcfaPositif,
  /** Total dans la devise de paiement, quand ce n'est pas le franc CFA. */
  conversion: SchemaConversion.optional(),
  statut: SchemaStatutCommande,
  creeeA: SchemaIsoDouala,
  /** Fin du blocage des sièges (15 min). */
  expireA: SchemaIsoDouala,
  /** Billets émis une fois la commande payée. */
  billetIds: z.array(SchemaId),
});
export type Commande = z.infer<typeof SchemaCommande>;

/* ------------------------------------------------------------------ paiement */

export const SchemaStatutPaiement = z.enum([
  "en_attente_confirmation",
  "reussi",
  "echoue",
  "expire",
]);
export type StatutPaiement = z.infer<typeof SchemaStatutPaiement>;

export const SchemaPayerCommande = z.object({
  commandeId: SchemaId,
  moyen: SchemaMoyenPaiement,
  /** MoMo ou Orange Money : numéro qui reçoit la demande de confirmation. */
  telephone: SchemaTelephone.optional(),
  /** Carte : jeton produit par le prestataire de paiement, jamais le numéro de carte. */
  jetonCarte: z.string().optional(),
});
export type PayerCommande = z.infer<typeof SchemaPayerCommande>;

export const SchemaPaiement = z.object({
  id: SchemaId,
  commandeId: SchemaId,
  moyen: SchemaMoyenPaiement,
  statut: SchemaStatutPaiement,
  montant: SchemaFcfaPositif,
  /** Consigne à afficher (« confirme sur ton téléphone avec ton code »). */
  consigne: z.string().optional(),
  /** Carte : adresse d'authentification 3-D Secure. */
  urlAuthentification: z.string().url().optional(),
  creeA: SchemaIsoDouala,
});
export type Paiement = z.infer<typeof SchemaPaiement>;

export const SchemaMessageStatutPaiement = z.object({
  paiementId: SchemaId,
  commandeId: SchemaId,
  statut: SchemaStatutPaiement,
  billetIds: z.array(SchemaId),
  instant: SchemaIsoDouala,
});
export type MessageStatutPaiement = z.infer<typeof SchemaMessageStatutPaiement>;

export const SchemaCreerLienProche = z.object({
  commandeId: SchemaId,
  procheId: SchemaId.optional(),
  telephone: SchemaTelephone.optional(),
});
export type CreerLienProche = z.infer<typeof SchemaCreerLienProche>;

export const SchemaLienProche = z.object({
  commandeId: SchemaId,
  url: z.string().url(),
  expireA: SchemaIsoDouala,
  envoyeA: SchemaTelephone.optional(),
});
export type LienProche = z.infer<typeof SchemaLienProche>;

/* ------------------------------------------------------------------ billet */

export const SchemaEtatBilletVoyageur = z.enum([
  "reserve",
  "paye",
  "embarque",
  "voyage",
  "annule",
  "non_presente",
  "reporte",
]);
export type EtatBilletVoyageur = z.infer<typeof SchemaEtatBilletVoyageur>;

export const SchemaBilletVoyageur = z.object({
  id: SchemaId,
  /** AGENCE-GARE-AAMMJJ-NNNN, jamais modifié. */
  numero: z.string(),
  etat: SchemaEtatBilletVoyageur,
  /** Un SMS avec le QR et le code a été envoyé. */
  smsEnvoye: z.boolean(),
  compagnie: SchemaCompagnieRef,
  classe: SchemaClasse,
  departId: SchemaId,
  heureDepart: SchemaIsoDouala,
  dureeMinutes: z.number().int().positive(),
  origine: z.object({ ville: SchemaVille, gare: z.string() }),
  destination: z.object({ ville: SchemaVille, gare: z.string() }),
  siege: z.number().int().positive().nullable(),
  prix: SchemaFcfaPositif,
  passager: z.object({
    nom: z.string(),
    pieceQuatreDerniers: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
  }),
  /** Contenu du QR code. */
  qr: z.string().min(1),
  /** Code à 4 chiffres pour embarquer sans scanner. */
  codeBillet: z.string().regex(/^\d{4}$/),
  /** Minutes avant le départ où il faut être au quai. */
  presenceQuaiMinutes: z.number().int().positive(),
  /** Fin de l'annulation gratuite. */
  annulationGratuiteJusqua: SchemaIsoDouala,
  /** Moto vers la gare proposée avec ce billet (« part à 07:10 · 700 F »). */
  courseProposee: z.object({ partirA: SchemaIsoDouala, prix: SchemaFcfaPositif }).optional(),
});
export type BilletVoyageur = z.infer<typeof SchemaBilletVoyageur>;

/* ------------------------------------------------------------------ annulation et report */

export const SchemaApercuAnnulation = z.object({
  billetId: SchemaId,
  autorise: z.boolean(),
  gratuite: z.boolean(),
  retenue: SchemaFcfaPositif,
  remboursement: SchemaFcfaPositif,
  gratuiteJusqua: SchemaIsoDouala,
});
export type ApercuAnnulation = z.infer<typeof SchemaApercuAnnulation>;

export const SchemaAnnulerBillet = z.object({ billetId: SchemaId, motif: z.string().optional() });
export type AnnulerBillet = z.infer<typeof SchemaAnnulerBillet>;

export const SchemaResultatAnnulation = z.object({
  billetId: SchemaId,
  etat: z.literal("annule"),
  retenue: SchemaFcfaPositif,
  remboursement: SchemaFcfaPositif,
  /** Le remboursement part vers le moyen de paiement d'origine. */
  rembourseSur: SchemaMoyenPaiement.optional(),
});
export type ResultatAnnulation = z.infer<typeof SchemaResultatAnnulation>;

export const SchemaReporterBillet = z.object({ billetId: SchemaId, departCibleId: SchemaId });
export type ReporterBillet = z.infer<typeof SchemaReporterBillet>;

export const SchemaResultatReport = z.object({
  ancienBilletId: SchemaId,
  billet: SchemaBilletVoyageur,
});
export type ResultatReport = z.infer<typeof SchemaResultatReport>;
