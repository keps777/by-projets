import { z } from "zod";
import { SchemaColisPartenaire } from "./colis";
import {
  SchemaCodeRetrait,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaNote,
  SchemaRefPhoto,
  SchemaTelephone,
  SchemaTelephoneMasque,
} from "./commun";

/* ------------------------------------------------------------------ côté voyageur : « Livraison moto en cours » */

/**
 * Livraison en cours vue par l'expéditeur et le destinataire. Elle porte le code de retrait parce que
 * le client doit le donner au livreur ; le livreur, lui, ne le reçoit jamais (voir `SchemaMissionLivraison`).
 */
export const SchemaLivraisonColis = z.object({
  colisId: SchemaId,
  numero: z.string(),
  statut: z.literal("en_livraison"),
  carte: z.object({
    depart: z.object({ libelle: z.string(), retireLe: SchemaIsoDouala }),
    livreurMinutes: z.int().nonnegative(),
    arrivee: z.string(),
  }),
  arrivee: z.object({
    libelle: z.string(),
    estimee: SchemaIsoDouala,
    poidsKg: z.number().positive(),
    assure: z.boolean(),
  }),
  livreur: z.object({
    id: SchemaId,
    initiales: z.string(),
    nom: z.string(),
    verifie: z.boolean(),
    note: SchemaNote,
    livraisons: z.int().nonnegative(),
    moto: z.string(),
    gilet: z.int().positive(),
  }),
  remise: z.object({
    destinataireALeCode: z.boolean(),
    code: SchemaCodeRetrait,
    /** Si le destinataire est absent, le livreur attend 10 minutes puis dépose au relais. */
    attenteAbsenceMinutes: z.int().positive(),
    relaisDeRepli: z.string(),
  }),
  prix: z.object({
    livraison: SchemaFcfaPositif,
    payee: z.boolean(),
    partLivreur: SchemaFcfaPositif,
  }),
  /** Invitation à devenir livreur, affichée en bas de l'écran. */
  devenir: z.object({ titre: z.string(), detail: z.string() }),
});
export type LivraisonColis = z.infer<typeof SchemaLivraisonColis>;

export const SchemaPositionLivreur = z.object({
  colisId: SchemaId,
  minutesRestantes: z.int().nonnegative(),
  arriveeEstimee: SchemaIsoDouala,
});
export type PositionLivreur = z.infer<typeof SchemaPositionLivreur>;

export const SchemaPartageSuivi = z.object({ colisId: SchemaId, destinataire: SchemaTelephone });
export const SchemaSuiviPartage = z.object({
  colisId: SchemaId,
  /** Lien de suivi public : il montre la position du livreur, jamais le code. */
  lien: z.string(),
  envoyeA: SchemaTelephoneMasque,
});
export type SuiviPartage = z.infer<typeof SchemaSuiviPartage>;

export const SchemaChangementAdresse = z.object({ colisId: SchemaId, adresse: z.string().min(1) });
export const SchemaAdresseChangee = z.object({
  colisId: SchemaId,
  adresse: z.string(),
  livreurPrevenu: z.boolean(),
});

/* ------------------------------------------------------------------ côté livreur : l'app du livreur moto */

/** Mission proposée à un livreur : 30 secondes pour accepter. Sans aucun code de retrait. */
export const SchemaMissionLivraison = z.strictObject({
  id: SchemaId,
  colis: SchemaColisPartenaire,
  trajet: z.strictObject({
    depart: z.string(),
    arrivee: z.string(),
    destinataire: z.string(),
  }),
  distanceM: z.int().positive(),
  dureeMinutes: z.int().positive(),
  /** Part du livreur : 70 % du prix de la livraison, arrondi à l'inférieur. */
  gain: SchemaFcfaPositif,
  delaiAcceptationSecondes: z.int().positive(),
  /** Après cet instant la mission passe au livreur suivant. */
  expireA: SchemaIsoDouala,
  /** La remise se fait contre le code du client, jamais sans. */
  remiseContreCode: z.literal(true),
});
export type MissionLivraison = z.infer<typeof SchemaMissionLivraison>;

export const SchemaEspaceLivreur = z.strictObject({
  livreur: z.strictObject({
    id: SchemaId,
    initiales: z.string(),
    nom: z.string(),
    numero: z.int().positive(),
    ville: z.string(),
    note: SchemaNote,
    disponible: z.boolean(),
  }),
  mission: SchemaMissionLivraison.nullable(),
  regles: z.strictObject({ titre: z.string(), texte: z.string() }),
  bilan: z.strictObject({
    aujourdhui: z.strictObject({ livraisons: z.int().nonnegative(), gain: SchemaFcfaPositif }),
    versement: z.string(),
    semaine: z.strictObject({ livraisons: z.int().nonnegative(), gain: SchemaFcfaPositif }),
  }),
  pieces: z.strictObject({
    aJour: z.boolean(),
    liste: z.array(z.strictObject({ type: z.string(), libelle: z.string(), valeur: z.string() })),
  }),
  retrait: z.strictObject({
    /** Solde disponible pour un retrait MoMo. */
    solde: SchemaFcfaPositif,
    /** Retrait possible dès ce montant (5 000 F). */
    seuil: SchemaFcfaPositif,
  }),
});
export type EspaceLivreur = z.infer<typeof SchemaEspaceLivreur>;

export const SchemaDisponibiliteLivreur = z.object({ disponible: z.boolean() });
export type DisponibiliteLivreur = z.infer<typeof SchemaDisponibiliteLivreur>;

export const SchemaParamsMission = z.object({ missionId: SchemaId });
export type ParamsMission = z.infer<typeof SchemaParamsMission>;

export const SchemaMissionAcceptee = z.strictObject({
  missionId: SchemaId,
  acceptee: z.literal(true),
  accepteeLe: SchemaIsoDouala,
  colis: SchemaColisPartenaire,
});
export type MissionAcceptee = z.infer<typeof SchemaMissionAcceptee>;

export const SchemaMissionPassee = z.strictObject({
  missionId: SchemaId,
  passee: z.literal(true),
});
export type MissionPassee = z.infer<typeof SchemaMissionPassee>;

/**
 * Remise au destinataire : le livreur envoie le code que le client lui a donné, après avoir vu la
 * pièce, et la photo du colis remis (jamais de la pièce).
 */
export const SchemaRemiseColisLivreur = z.object({
  missionId: SchemaId,
  code: SchemaCodeRetrait,
  pieceVerifiee: z.literal(true),
  photoRef: SchemaRefPhoto,
});
export type RemiseColisLivreur = z.infer<typeof SchemaRemiseColisLivreur>;

export const SchemaColisLivre = z.strictObject({
  missionId: SchemaId,
  colis: SchemaColisPartenaire,
  livreLe: SchemaIsoDouala,
  gain: SchemaFcfaPositif,
  /** La preuve photo est transmise à l'expéditeur et au destinataire. */
  photoTransmise: z.boolean(),
});
export type ColisLivre = z.infer<typeof SchemaColisLivre>;

export const SchemaAbsenceDestinataire = z.object({ missionId: SchemaId });
export const SchemaAbsenceEnregistree = z.strictObject({
  missionId: SchemaId,
  attenteMinutes: z.int().positive(),
  attenteJusqua: SchemaIsoDouala,
  relaisDeRepli: z.strictObject({ id: SchemaId, nom: z.string() }),
});
export type AbsenceEnregistree = z.infer<typeof SchemaAbsenceEnregistree>;

export const SchemaDemandeRetraitGains = z.object({ montant: SchemaFcfaPositif.optional() });
export const SchemaRetraitGains = z.strictObject({
  montant: SchemaFcfaPositif,
  moyen: z.string(),
  demandeLe: SchemaIsoDouala,
});
export type RetraitGains = z.infer<typeof SchemaRetraitGains>;

export const SchemaInvitationLivreur = z.object({ telephone: SchemaTelephone });
export const SchemaInvitationEnvoyee = z.strictObject({
  envoyeA: SchemaTelephoneMasque,
  envoyeLe: SchemaIsoDouala,
});

/** Message temps réel du canal des missions : proposition ou expiration. */
export const SchemaMessageMissions = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("proposee"), mission: SchemaMissionLivraison }),
  z.strictObject({ type: z.literal("expiree"), missionId: SchemaId }),
]);
export type MessageMissions = z.infer<typeof SchemaMessageMissions>;
