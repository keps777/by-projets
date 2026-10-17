import { z } from "zod";
import {
  SchemaCodeRetrait,
  SchemaEtatColis,
  SchemaFcfa,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaModeColis,
  SchemaRefPhoto,
  SchemaTelephone,
  SchemaTelephoneMasque,
} from "./commun";

/* ------------------------------------------------------------------ vue pour l'expéditeur / le destinataire */

export const JALONS_SUIVI = ["depose", "charge", "en_route", "disponible", "remis"] as const;
export const SchemaJalonSuivi = z.enum(JALONS_SUIVI);
export type JalonSuivi = z.infer<typeof SchemaJalonSuivi>;

/** Une étape du suivi. `a` vaut null tant que l'heure n'est pas connue ; `estimee` marque une prévision (« ~13:00 »). */
export const SchemaEtapeSuivi = z.object({
  jalon: SchemaJalonSuivi,
  libelle: z.string(),
  detail: z.string().nullable(),
  a: SchemaIsoDouala.nullable(),
  estimee: z.boolean(),
  fait: z.boolean(),
});
export type EtapeSuivi = z.infer<typeof SchemaEtapeSuivi>;

/** Ce que le propriétaire peut encore choisir pour son colis (livrer à domicile, déposer en relais). */
export const SchemaOptionRetrait = z.object({
  mode: z.enum(["relais", "moto"]),
  titre: z.string(),
  detail: z.string(),
  prix: SchemaFcfaPositif,
});

/**
 * Code de retrait tel que le voit l'expéditeur : à donner au destinataire seulement.
 * Le destinataire le reçoit par SMS. Aucun autre rôle ne reçoit ce bloc.
 */
export const SchemaRetraitProprietaire = z.object({
  code: SchemaCodeRetrait,
  libelle: z.string(),
  consigne: z.string(),
  photoDepot: z.object({ libelle: z.string(), a: SchemaIsoDouala }).nullable(),
});

/**
 * Colis vu par son expéditeur ou son destinataire (écran « Colis · code · suivi · photo »).
 * C'est la seule vue qui porte le code de retrait.
 */
export const SchemaColisProprietaire = z.object({
  id: SchemaId,
  numero: z.string(),
  role: z.enum(["expediteur", "destinataire"]),
  etat: SchemaEtatColis,
  mode: SchemaModeColis,
  contenu: z.string(),
  poidsKg: z.number().positive(),
  assure: z.boolean(),
  /** Valeur assurée, 0 si le colis n'est pas assuré. */
  valeurAssuree: SchemaFcfaPositif,
  prixTotal: SchemaFcfaPositif,
  creeA: SchemaIsoDouala,
  expediteur: z.object({ nom: z.string(), telephone: SchemaTelephone }),
  destinataire: z.object({
    nom: z.string(),
    /** Nom sous lequel l'expéditeur l'a enregistré (« Maman »). */
    surnom: z.string().nullable(),
    telephone: SchemaTelephone,
  }),
  retrait: SchemaRetraitProprietaire,
  suivi: z.array(SchemaEtapeSuivi),
  /** Arrivée prévue au point de retrait, si le colis est encore en route. */
  arriveePrevue: SchemaIsoDouala.nullable(),
  options: z.array(SchemaOptionRetrait),
  reclamation: z.object({
    delaiReponseJoursOuvres: z.int().positive(),
    /** Une perte prouvée par le suivi est remboursée 10 fois le port, ou la valeur assurée. */
    multiplePortSiPerte: z.int().positive(),
    texte: z.string(),
  }),
});
export type ColisProprietaire = z.infer<typeof SchemaColisProprietaire>;

/* ------------------------------------------------------------------ vue pour le guichet, le relais, le livreur, une compagnie partenaire */

/**
 * Colis vu par le guichet, un point relais, un livreur ou une compagnie partenaire.
 *
 * Volontairement strict et sans code de retrait, ni haché, ni sel : `codeRequis` indique seulement
 * que la remise se fait contre le code du client et sa pièce. Un champ en plus fait échouer la
 * validation de la réponse (voir `securite.ts`).
 */
export const SchemaColisPartenaire = z.strictObject({
  id: SchemaId,
  numero: z.string(),
  etat: SchemaEtatColis,
  mode: SchemaModeColis,
  poidsKg: z.number().positive(),
  assure: z.boolean(),
  valeurAssuree: SchemaFcfaPositif,
  expediteur: z.strictObject({ nom: z.string() }),
  destinataire: z.strictObject({ nom: z.string(), telephoneMasque: SchemaTelephoneMasque }),
  /** La remise exige le code du client et sa pièce d'identité. */
  codeRequis: z.literal(true),
  /** Début des 7 jours de garde. */
  disponibleDepuis: SchemaIsoDouala.nullable(),
  /** Fin de la garde (J+7) ; après cette date le colis est « non retiré ». */
  limiteRetrait: SchemaIsoDouala.nullable(),
});
export type ColisPartenaire = z.infer<typeof SchemaColisPartenaire>;

/* ------------------------------------------------------------------ requêtes communes */

export const SchemaParamsColis = z.object({ colisId: SchemaId });
export type ParamsColis = z.infer<typeof SchemaParamsColis>;

export const SchemaEnvoiCodeColis = z.object({
  colisId: SchemaId,
  canal: z.enum(["sms", "whatsapp"]).default("sms"),
});
export type EnvoiCodeColis = z.input<typeof SchemaEnvoiCodeColis>;

/** Accusé d'envoi du code : le code lui-même ne revient pas, le client l'a déjà. */
export const SchemaAccuseEnvoiCode = z.object({
  colisId: SchemaId,
  canal: z.enum(["sms", "whatsapp"]),
  envoyeA: SchemaTelephoneMasque,
  envoyeLe: SchemaIsoDouala,
});
export type AccuseEnvoiCode = z.infer<typeof SchemaAccuseEnvoiCode>;

export const MOTIFS_RECLAMATION = ["perdu", "abime", "retard", "autre"] as const;

export const SchemaDemandeReclamation = z.object({
  colisId: SchemaId,
  motif: z.enum(MOTIFS_RECLAMATION),
  message: z.string().max(1000).optional(),
});
export type DemandeReclamation = z.infer<typeof SchemaDemandeReclamation>;

export const SchemaReclamationOuverte = z.object({
  reference: z.string(),
  colisId: SchemaId,
  motif: z.enum(MOTIFS_RECLAMATION),
  ouverteLe: SchemaIsoDouala,
  /** Réponse promise sous 2 jours ouvrés. */
  reponseAvant: SchemaIsoDouala,
});
export type ReclamationOuverte = z.infer<typeof SchemaReclamationOuverte>;

/** Changer le mode de retrait d'un colis déjà parti (relais ou livraison moto). */
export const SchemaChangementMode = z.object({
  colisId: SchemaId,
  mode: z.enum(["relais", "moto"]),
  relaisId: SchemaId.optional(),
  adresse: z.string().optional(),
});
export type ChangementMode = z.infer<typeof SchemaChangementMode>;

export const SchemaModeChange = z.object({
  colisId: SchemaId,
  mode: SchemaModeColis,
  /** Supplément dû pour ce mode (300 F relais, dès 1 000 F livraison). */
  supplement: SchemaFcfaPositif,
  devis: z.object({ total: SchemaFcfa }),
});
export type ModeChange = z.infer<typeof SchemaModeChange>;

/** Message temps réel du suivi d'un colis. */
export const SchemaMessageSuiviColis = z.object({
  colisId: SchemaId,
  etat: SchemaEtatColis,
  jalon: SchemaJalonSuivi,
  a: SchemaIsoDouala,
});
export type MessageSuiviColis = z.infer<typeof SchemaMessageSuiviColis>;
