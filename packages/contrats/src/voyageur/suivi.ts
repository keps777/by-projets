import { z } from "zod";
import {
  SchemaClasse,
  SchemaCompagnieRef,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaTelephone,
} from "./commun";

/* ------------------------------------------------------------------ mon bus en direct */

export const SchemaStatutEtape = z.enum(["passe", "prochain", "a_venir"]);
export type StatutEtape = z.infer<typeof SchemaStatutEtape>;

export const SchemaEtapeTrajet = z.object({
  /** Nom de l'arrêt (« Edéa »). */
  arret: z.string(),
  /** Heure de passage réelle ou prévue. */
  heure: SchemaIsoDouala,
  statut: SchemaStatutEtape,
  /** Précision affichée à côté du nom (« arrêt 10 min », « 4 places montent ici »). */
  precision: z.string().optional(),
  arretMinutes: z.number().int().positive().optional(),
  placesQuiMontent: z.number().int().positive().optional(),
});
export type EtapeTrajet = z.infer<typeof SchemaEtapeTrajet>;

export const SchemaPrevenirProche = z.object({
  /** Proche à prévenir (« Maman »). */
  procheId: SchemaId,
  nom: z.string(),
  /** Le SMS part ce nombre de minutes avant l'arrivée (15). */
  minutesAvantArrivee: z.number().int().positive(),
  /** Gare d'arrivée citée dans le SMS (« Mvan »). */
  gareArrivee: z.string(),
  actif: z.boolean(),
});
export type PrevenirProche = z.infer<typeof SchemaPrevenirProche>;

export const SchemaSuiviBus = z.object({
  billetId: SchemaId,
  enDirect: z.boolean(),
  compagnie: SchemaCompagnieRef,
  siege: z.number().int().positive().nullable(),
  bus: z.object({ immatriculation: z.string() }),
  /** Villes de la carte, dans l'ordre du trajet. */
  villes: z.array(z.string()),
  vitesseKmh: z.number().int().nonnegative(),
  arrivee: z.object({
    prevue: SchemaIsoDouala,
    estimee: SchemaIsoDouala,
    /** Retard estimé, en minutes (0 si à l'heure). */
    retardMinutes: z.number().int().nonnegative(),
  }),
  etapes: z.array(SchemaEtapeTrajet),
  prevenir: SchemaPrevenirProche.optional(),
});
export type SuiviBus = z.infer<typeof SchemaSuiviBus>;

/** Message du canal temps réel de la position du bus. */
export const SchemaMessagePositionBus = z.object({
  billetId: SchemaId,
  instant: SchemaIsoDouala,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  vitesseKmh: z.number().int().nonnegative(),
  arriveeEstimee: SchemaIsoDouala,
  retardMinutes: z.number().int().nonnegative(),
  prochainArret: z.string().optional(),
});
export type MessagePositionBus = z.infer<typeof SchemaMessagePositionBus>;

export const SchemaActiverPrevenirProche = z.object({
  billetId: SchemaId,
  procheId: SchemaId,
  minutesAvantArrivee: z.number().int().positive().optional(),
});
export type ActiverPrevenirProche = z.infer<typeof SchemaActiverPrevenirProche>;

export const SchemaResultatPrevenirProche = z.object({
  billetId: SchemaId,
  procheId: SchemaId,
  actif: z.boolean(),
  envoyeA: SchemaTelephone.optional(),
  minutesAvantArrivee: z.number().int().positive(),
});
export type ResultatPrevenirProche = z.infer<typeof SchemaResultatPrevenirProche>;

/* ------------------------------------------------------------------ le réseau en direct */

export const SchemaLigneReseau = z.object({
  id: SchemaId,
  depart: z.string(),
  arrivee: z.string(),
  /** Ville de correspondance (« Bafoussam »). */
  via: z.string().optional(),
  mode: z.enum(["bus", "covoiturage"]),
  compagnies: z.number().int().nonnegative().optional(),
  /** Prochains départs, dans l'ordre. */
  prochains: z.array(z.object({ heure: SchemaIsoDouala, libelle: z.string() })),
  /** Correspondance entre deux bus sur un seul billet. */
  correspondanceMinutes: z.number().int().positive().optional(),
  /** Phrase du serveur résumant la ligne (« aucun bus avant 14 h · 2 voitures… »). */
  resume: z.string(),
  /** Prix à partir de ; le prix exact pour un covoiturage. */
  prix: SchemaFcfaPositif,
  prixEstUnMinimum: z.boolean(),
});
export type LigneReseau = z.infer<typeof SchemaLigneReseau>;

export const SchemaApercuReseau = z.object({
  maintenant: SchemaIsoDouala,
  compagnies: z.number().int().nonnegative(),
  busEnRoute: z.number().int().nonnegative(),
  departsAVenir: z.number().int().nonnegative(),
  filtres: z.array(z.string()),
  filtreActif: z.string(),
  villes: z.array(z.string()),
  lignes: z.array(SchemaLigneReseau),
});
export type ApercuReseau = z.infer<typeof SchemaApercuReseau>;

export const SchemaDemandeReseau = z.object({ filtre: z.string().optional() });
export type DemandeReseau = z.infer<typeof SchemaDemandeReseau>;

/* ------------------------------------------------------------------ monter en route */

export const SchemaDemandeMonteeEnRoute = z.object({
  /** Arrêt où se trouve le voyageur ; sinon la position GPS. */
  arretId: SchemaId.optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});
export type DemandeMonteeEnRoute = z.infer<typeof SchemaDemandeMonteeEnRoute>;

export const SchemaBusQuiPasse = z.object({
  departId: SchemaId,
  compagnie: SchemaCompagnieRef,
  classe: SchemaClasse,
  /** Heure de passage à l'arrêt du voyageur. */
  passeA: SchemaIsoDouala,
  passeDansMinutes: z.number().int().nonnegative(),
  placesLibres: z.number().int().nonnegative(),
  /** Heure de départ de la ville d'origine, quand le bus est déjà parti. */
  partiA: SchemaIsoDouala.optional(),
  arriveeDestination: SchemaIsoDouala,
  /** Prix de la montée, au prorata de la distance restante. */
  prix: SchemaFcfaPositif,
  prorata: z.boolean(),
});
export type BusQuiPasse = z.infer<typeof SchemaBusQuiPasse>;

export const SchemaOffresMonteeEnRoute = z.object({
  maintenant: SchemaIsoDouala,
  arret: z.object({ id: SchemaId, nom: z.string(), gps: z.boolean() }),
  ligne: z.object({
    libelle: z.string(),
    sens: z.string(),
    arrets: z.array(z.string()),
    arretCourant: z.string(),
    pointDeMontee: z.string(),
  }),
  bus: z.array(SchemaBusQuiPasse),
});
export type OffresMonteeEnRoute = z.infer<typeof SchemaOffresMonteeEnRoute>;

export const SchemaReserverMontee = z.object({
  departId: SchemaId,
  arretId: SchemaId,
  moyen: z.enum(["mtn_momo", "orange_money", "carte"]).optional(),
});
export type ReserverMontee = z.infer<typeof SchemaReserverMontee>;

/* ------------------------------------------------------------------ moto ou taxi vers la gare */

export const SchemaModeCourse = z.enum(["moto", "taxi", "avec_valises"]);
export type ModeCourse = z.infer<typeof SchemaModeCourse>;

export const SchemaPropositionCourse = z.object({
  billetId: SchemaId,
  lieuDepart: z.string(),
  gare: z.string(),
  modes: z.array(
    z.object({
      mode: SchemaModeCourse,
      libelle: z.string(),
      /** Absent pour une option sans prix propre (« Avec 2 valises »). */
      prix: SchemaFcfaPositif.optional(),
      choisi: z.boolean(),
    }),
  ),
  /** Heure de départ conseillée pour être au quai à temps. */
  partirA: SchemaIsoDouala,
  arriveeQuai: SchemaIsoDouala,
  trajetMinutes: z.number().int().positive(),
  busA: SchemaIsoDouala,
  presenceQuaiMinutes: z.number().int().positive(),
  chauffeur: z.object({
    id: SchemaId,
    nom: z.string(),
    initiales: z.string(),
    type: z.string(),
    verifie: z.boolean(),
    note: z.number().min(0).max(5).optional(),
    detail: z.string(),
    arriveDansMinutes: z.number().int().nonnegative(),
  }),
  /** Prix de la course, payé avec le billet. */
  prix: SchemaFcfaPositif,
  payeAvecBillet: z.boolean(),
  rappelMinutes: z.number().int().positive(),
  annulationGratuiteJusqua: SchemaIsoDouala,
});
export type PropositionCourse = z.infer<typeof SchemaPropositionCourse>;

export const SchemaReserverCourse = z.object({
  billetId: SchemaId,
  mode: SchemaModeCourse,
  partirA: SchemaIsoDouala,
});
export type ReserverCourse = z.infer<typeof SchemaReserverCourse>;

export const SchemaCourse = z.object({
  id: SchemaId,
  billetId: SchemaId,
  mode: SchemaModeCourse,
  statut: z.enum(["reservee", "en_approche", "en_cours", "terminee", "annulee"]),
  partirA: SchemaIsoDouala,
  prix: SchemaFcfaPositif,
  chauffeurId: SchemaId,
});
export type Course = z.infer<typeof SchemaCourse>;
