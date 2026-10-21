import { z } from "zod";
import { SchemaFcfaPositif, SchemaId, SchemaIsoDouala, SchemaTelephone } from "./commun";
import { SchemaDepartResume } from "./departs";

export const SchemaModeGroupe = z.enum(["groupe", "bus_entier", "cagnotte"]);
export type ModeGroupe = z.infer<typeof SchemaModeGroupe>;

export const SchemaStatutParticipant = z.enum(["paye", "lien_envoye", "en_attente"]);
export type StatutParticipant = z.infer<typeof SchemaStatutParticipant>;

export const SchemaParticipantGroupe = z.object({
  /** Absent pour un invité qui n'a pas encore de compte. */
  id: SchemaId.optional(),
  nom: z.string(),
  initiales: z.string(),
  /** Nombre de places couvertes (1, ou plusieurs pour un regroupement « Marthe, Jo… »). */
  places: z.number().int().positive(),
  statut: SchemaStatutParticipant,
});
export type ParticipantGroupe = z.infer<typeof SchemaParticipantGroupe>;

export const SchemaGroupe = z.object({
  id: SchemaId,
  mode: SchemaModeGroupe,
  depart: SchemaDepartResume,
  /** Libellé du trajet (« Douala → Bafoussam »). */
  trajet: z.string(),
  voyageurs: z.number().int().min(2).max(12),
  /** Sièges réservés ensemble. */
  sieges: z.array(z.number().int().positive()),
  /** Fin du blocage des sièges (15 min pour payer). */
  blocageJusqua: SchemaIsoDouala,
  cagnotte: z.object({
    prixPlace: SchemaFcfaPositif,
    total: SchemaFcfaPositif,
    partMoi: SchemaFcfaPositif,
    participants: z.array(SchemaParticipantGroupe),
  }),
  /** Lien WhatsApp à partager aux amis. */
  lienPartage: z.string().url(),
});
export type Groupe = z.infer<typeof SchemaGroupe>;

export const SchemaDemandeGroupe = z.object({ groupeId: SchemaId });
export type DemandeGroupe = z.infer<typeof SchemaDemandeGroupe>;

export const SchemaCreerGroupe = z.object({
  departId: SchemaId,
  voyageurs: z.number().int().min(2).max(12),
  mode: SchemaModeGroupe,
  placesCoteACote: z.boolean().optional(),
});
export type CreerGroupe = z.infer<typeof SchemaCreerGroupe>;

export const SchemaInviterGroupe = z.object({
  groupeId: SchemaId,
  telephones: z.array(SchemaTelephone).min(1),
});
export type InviterGroupe = z.infer<typeof SchemaInviterGroupe>;

export const SchemaResultatInvitation = z.object({
  groupeId: SchemaId,
  liensEnvoyes: z.number().int().nonnegative(),
});
export type ResultatInvitation = z.infer<typeof SchemaResultatInvitation>;

export const SchemaDemandeDevisBus = z.object({
  departId: SchemaId.optional(),
  /** Taille du bus à louer (30). */
  places: z.number().int().positive(),
});
export type DemandeDevisBus = z.infer<typeof SchemaDemandeDevisBus>;

export const SchemaDevisBus = z.object({
  id: SchemaId,
  places: z.number().int().positive(),
  statut: z.enum(["demande", "chiffre"]),
  /** Réponse de la compagnie attendue d'ici cette heure. */
  reponseAttendueAvant: SchemaIsoDouala,
  montant: SchemaFcfaPositif.optional(),
});
export type DevisBus = z.infer<typeof SchemaDevisBus>;
