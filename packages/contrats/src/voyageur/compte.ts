import { z } from "zod";
import { SchemaFcfaPositif, SchemaId, SchemaIsoDouala, SchemaTelephone } from "./commun";

/* ------------------------------------------------------------------ connexion OTP */

export const SchemaCanalCode = z.enum(["sms", "whatsapp", "ussd"]);
export type CanalCode = z.infer<typeof SchemaCanalCode>;

export const SchemaDemandeCode = z.object({
  telephone: SchemaTelephone,
  /** Par défaut : SMS. */
  canal: SchemaCanalCode.optional(),
});
export type DemandeCode = z.infer<typeof SchemaDemandeCode>;

export const SchemaReponseDemandeCode = z.object({
  telephone: SchemaTelephone,
  canal: SchemaCanalCode,
  /** Nombre de chiffres attendus (4). */
  longueurCode: z.number().int().positive(),
  /** Secondes avant de pouvoir demander un nouveau code (« renvoyer dans 0:42 »). */
  renvoiDansSecondes: z.number().int().nonnegative(),
  expireA: SchemaIsoDouala,
});
export type ReponseDemandeCode = z.infer<typeof SchemaReponseDemandeCode>;

export const SchemaVerificationCode = z.object({
  telephone: SchemaTelephone,
  code: z.string().regex(/^\d{4}$/),
});
export type VerificationCode = z.infer<typeof SchemaVerificationCode>;

/* ------------------------------------------------------------------ profil */

export const SchemaProfil = z.object({
  id: SchemaId,
  prenom: z.string(),
  nom: z.string(),
  initiales: z.string(),
  telephone: SchemaTelephone,
  /** Pièce d'identité vérifiée (« CNI vérifiée »). */
  pieceVerifiee: z.boolean(),
  /** 4 derniers chiffres de la pièce, imprimés sur le billet. */
  pieceQuatreDerniers: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  /** Date d'inscription. */
  inscritDepuis: SchemaIsoDouala,
  langue: z.enum(["fr", "en"]),
});
export type Profil = z.infer<typeof SchemaProfil>;

export const SchemaSessionVoyageur = z.object({
  jeton: z.string().min(1),
  expireA: SchemaIsoDouala,
  nouveauCompte: z.boolean(),
  profil: SchemaProfil,
});
export type SessionVoyageur = z.infer<typeof SchemaSessionVoyageur>;

/* ------------------------------------------------------------------ fidélité et parrainage */

export const SchemaFidelite = z.object({
  points: z.number().int().nonnegative(),
  /** 1 point = 1 FCFA sur le prochain billet. */
  valeurFcfa: SchemaFcfaPositif,
});
export type Fidelite = z.infer<typeof SchemaFidelite>;

export const SchemaParrainage = z.object({
  /** Code à partager (« AMI »). */
  code: z.string(),
  amis: z.number().int().nonnegative(),
  bonusParrain: SchemaFcfaPositif,
  bonusFilleul: SchemaFcfaPositif,
});
export type Parrainage = z.infer<typeof SchemaParrainage>;

/* ------------------------------------------------------------------ proches */

export const SchemaProche = z.object({
  id: SchemaId,
  /** Nom affiché (« Maman »). */
  nom: z.string(),
  /** Nom complet, quand il est connu (« Thérèse Ngo »). */
  nomComplet: z.string().optional(),
  initiales: z.string(),
  ville: z.string().optional(),
  /** Numéro complet ; l'écran le masque si besoin. */
  telephone: SchemaTelephone.optional(),
  /** Prévenu à chaque arrivée du voyageur. */
  prevenuALArrivee: z.boolean(),
  /** Ce proche paie les voyages (depuis l'étranger, par carte). */
  payeMesVoyages: z.boolean(),
});
export type Proche = z.infer<typeof SchemaProche>;

export const SchemaNouveauProche = z.object({
  nom: z.string().min(1),
  telephone: SchemaTelephone,
  ville: z.string().optional(),
  prevenuALArrivee: z.boolean().optional(),
});
export type NouveauProche = z.infer<typeof SchemaNouveauProche>;

/* ------------------------------------------------------------------ historique */

export const SchemaStatutHistorique = z.enum(["a_venir", "a_retirer", "voyage", "annule", "livre"]);
export type StatutHistorique = z.infer<typeof SchemaStatutHistorique>;

export const SchemaElementHistorique = z.object({
  type: z.enum(["voyage", "colis"]),
  /** Identifiant du billet ou du colis. */
  id: SchemaId,
  /** Libellé du trajet ou du colis (« Douala → Yaoundé »). */
  titre: z.string(),
  /** Date et heure du départ pour un voyage. */
  departA: SchemaIsoDouala.optional(),
  /** Ligne de détail : compagnie, siège, numéro, poids. */
  detail: z.string(),
  montant: SchemaFcfaPositif,
  statut: SchemaStatutHistorique,
  /** Reçu téléchargeable. */
  recuDisponible: z.boolean(),
});
export type ElementHistorique = z.infer<typeof SchemaElementHistorique>;

export const SchemaHistorique = z.object({ elements: z.array(SchemaElementHistorique) });
export type Historique = z.infer<typeof SchemaHistorique>;
