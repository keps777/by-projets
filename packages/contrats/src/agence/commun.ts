import { z } from "zod";

/**
 * Briques communes des contrats « agence » (guichet, caisse, quai, bus, supervision).
 *
 * Règles de tout le dossier :
 * - montants en FCFA : entiers (jamais de flottant), négatifs permis pour les écarts ;
 * - heures : chaîne ISO 8601 en heure de Douala (`+01:00`, fuseau Africa/Douala) ;
 * - identifiants de documents : opaques (`SchemaId`) ; identifiants d'événements : UUID.
 */

/** Identifiant opaque d'une entité du domaine (billet, départ, personne, appareil…). */
export const SchemaId = z.string().min(1);
export type IdAgence = z.infer<typeof SchemaId>;

/** UUID créé sur l'appareil (identifiant d'événement, identifiant d'un document créé hors ligne). */
export const SchemaUuid = z.uuid();

/** Montant en francs CFA : entier, négatif permis (écart de caisse, annulation). */
export const SchemaFcfa = z.number().int();
export type FcfaAgence = z.infer<typeof SchemaFcfa>;

/** Montant en francs CFA qui ne peut pas être négatif. */
export const SchemaFcfaPositif = z.number().int().min(0);

/** Heure ISO 8601 en heure de Douala (Africa/Douala, UTC+01:00, sans heure d'été). */
export const SchemaIsoDouala = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/,
    "Heure ISO en Africa/Douala attendue (décalage +01:00)",
  );
export type IsoDoualaAgence = z.infer<typeof SchemaIsoDouala>;

/** Numéro de téléphone au format international, sans espace : +237677301145. */
export const SchemaTelephone = z.string().regex(/^\+\d{8,15}$/, "Format +237XXXXXXXXX attendu");

/** Quatre derniers chiffres d'une pièce d'identité. */
export const SchemaPieceQuatreDerniers = z.string().regex(/^\d{4}$/);

/** Code de 4 chiffres d'un billet (embarquer sans scanner). */
export const SchemaCodeBillet = z.string().regex(/^\d{4}$/);

/** NNNN d'un numéro de billet ou de colis (0001 à 9999). */
export const SchemaSequence = z.number().int().min(1).max(9999);

export const SchemaClasse = z.enum(["classique", "vip"]);

export const SchemaModePaiement = z.enum(["cash", "momo", "orange_money"]);
export type ModePaiementAgence = z.infer<typeof SchemaModePaiement>;

/** Paiement encaissé au guichet. `recu` et `rendu` ne servent qu'au cash (0 sinon). */
export const SchemaPaiement = z.object({
  mode: SchemaModePaiement,
  recu: SchemaFcfaPositif,
  rendu: SchemaFcfaPositif,
  /** Référence de la transaction (MoMo, Orange Money). */
  reference: z.string().nullable(),
});
export type PaiementAgence = z.infer<typeof SchemaPaiement>;

export const SchemaPersonneRef = z.object({
  id: SchemaId,
  nom: z.string().min(1),
});
export type PersonneRef = z.infer<typeof SchemaPersonneRef>;

/** Un départ tel que l'affichent les listes de l'agence. */
export const SchemaDepartResume = z.object({
  departId: SchemaId,
  heureDepart: SchemaIsoDouala,
  /** Ville de destination : « Yaoundé », « Bafoussam ». */
  destination: z.string().min(1),
  placesLibres: z.number().int().min(0),
});
export type DepartResume = z.infer<typeof SchemaDepartResume>;

/** Plage de numéros attribuée à un appareil pour un jour (voir `plageGuichet` du domaine). */
export const SchemaPlage = z.object({
  debut: SchemaSequence,
  fin: SchemaSequence,
});
export type PlageAgence = z.infer<typeof SchemaPlage>;

export const SchemaEtatSynchro = z.enum(["sync", "en_attente", "hors_ligne"]);

/** État de la synchronisation de l'appareil (pastille « SYNC »). */
export const SchemaSynchro = z.object({
  etat: SchemaEtatSynchro,
  /** Dernière synchronisation réussie ; null si jamais. */
  derniereSyncA: SchemaIsoDouala.nullable(),
  /** Nombre d'événements enregistrés sur l'appareil, pas encore envoyés. */
  evenementsEnAttente: z.number().int().min(0),
});
export type SynchroAgence = z.infer<typeof SchemaSynchro>;

/** Imprimante de l'appareil (Bluetooth ou USB). */
export const SchemaImprimante = z.object({
  etat: z.enum(["ok", "papier_vide", "hors_service", "absente"]),
  nom: z.string().nullable(),
});
export type ImprimanteAgence = z.infer<typeof SchemaImprimante>;

/**
 * Preuve qu'un superviseur a validé une action avec son PIN ou son empreinte.
 *
 * Le PIN ne quitte jamais l'appareil du superviseur : il vérifie son PIN localement, puis l'appareil
 * signe le contenu de l'événement. Seule cette signature voyage et entre dans le journal.
 */
export const SchemaValidationSuperviseur = z.object({
  superviseurId: SchemaId,
  methode: z.enum(["pin", "empreinte"]),
  /** Signature hexadécimale du contenu de l'événement. */
  signature: z.string().regex(/^[0-9a-f]{16,}$/),
});
export type ValidationSuperviseur = z.infer<typeof SchemaValidationSuperviseur>;

/** État d'un siège sur le plan du bus. */
export const SchemaEtatSiege = z.enum(["libre", "pris", "attribue"]);
export type EtatSiegeAgence = z.infer<typeof SchemaEtatSiege>;

/** Billet prêt à imprimer ou à afficher : ce que porte le ticket de caisse. */
export const SchemaBilletImprimable = z.object({
  billetId: SchemaId,
  /** AGENCE-GARE-AAMMJJ-NNNN, jamais modifié. */
  numero: z.string().min(1),
  sequence: SchemaSequence,
  compagnie: z.string().min(1),
  trajet: z.object({ origine: z.string().min(1), destination: z.string().min(1) }),
  heureDepart: SchemaIsoDouala,
  siege: z.number().int().min(1).nullable(),
  classe: SchemaClasse,
  passager: z.object({
    nom: z.string().nullable(),
    pieceQuatreDerniers: SchemaPieceQuatreDerniers.nullable(),
  }),
  codeBillet: SchemaCodeBillet,
  /** Contenu du QR code. */
  qr: z.string().min(1),
  prix: SchemaFcfaPositif,
  /** Billet de cadence : le nom et la pièce se complètent au quai. */
  aCompleterAuQuai: z.boolean(),
});
export type BilletImprimable = z.infer<typeof SchemaBilletImprimable>;
