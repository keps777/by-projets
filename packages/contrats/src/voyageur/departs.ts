import { z } from "zod";
import {
  SchemaClasse,
  SchemaCompagnieRef,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaJour,
  SchemaMoyenPaiement,
  SchemaTelephone,
  SchemaVille,
} from "./commun";
import { SchemaTrajetRegulier } from "./covoit";

/* ------------------------------------------------------------------ recherche entre villes */

export const SchemaFiltresDeparts = z.object({
  /** « toutes » par défaut. */
  classe: z.enum(["toutes", "vip", "classique"]).optional(),
  /** Compagnies retenues ; vide ou absent = toutes. */
  compagnies: z.array(SchemaId).optional(),
  /** Ne garder que les compagnies préférées. */
  preferees: z.boolean().optional(),
  inclureCovoit: z.boolean().optional(),
  matinSeulement: z.boolean().optional(),
  placesCoteACote: z.boolean().optional(),
  prixMax: SchemaFcfaPositif.optional(),
});
export type FiltresDeparts = z.infer<typeof SchemaFiltresDeparts>;

export const SchemaRechercheDeparts = z.object({
  /** Codes des villes (DLA, YDE). */
  depart: z.string(),
  arrivee: z.string(),
  jour: SchemaJour.optional(),
  filtres: SchemaFiltresDeparts.optional(),
});
export type RechercheDeparts = z.infer<typeof SchemaRechercheDeparts>;

/** Un départ de bus tel que la liste de l'accueil l'affiche. */
export const SchemaDepartVoyageur = z.object({
  id: SchemaId,
  /** AGENCE-LIGNE-AAMMJJ-HHMM */
  numero: z.string(),
  compagnie: SchemaCompagnieRef,
  classe: SchemaClasse,
  heureDepart: SchemaIsoDouala,
  /** Prix du billet seul, sans les frais de service. */
  prix: SchemaFcfaPositif,
  placesLibres: z.number().int().nonnegative(),
  /** Vrai quand il reste très peu de places (« plus que 3 »). */
  presqueComplet: z.boolean(),
});
export type DepartVoyageur = z.infer<typeof SchemaDepartVoyageur>;

/** Identité d'un départ sans ses places ni son prix (groupe, réservation). */
export const SchemaDepartResume = SchemaDepartVoyageur.pick({
  id: true,
  numero: true,
  compagnie: true,
  heureDepart: true,
});
export type DepartResume = z.infer<typeof SchemaDepartResume>;

/** Résumé d'un covoiturage proposé dans la liste des départs. */
export const SchemaCovoitDansListe = z.object({
  id: SchemaId,
  heureDepart: SchemaIsoDouala,
  conducteur: z.string(),
  verifie: z.boolean(),
  lieuDepart: z.string(),
  placesLibres: z.number().int().nonnegative(),
  vehicule: z.string(),
  prixParPlace: SchemaFcfaPositif,
});
export type CovoitDansListe = z.infer<typeof SchemaCovoitDansListe>;

export const SchemaNotificationColis = z.object({
  colisId: SchemaId,
  titre: z.string(),
  detail: z.string(),
});
export type NotificationColis = z.infer<typeof SchemaNotificationColis>;

export const SchemaResultatRechercheDeparts = z.object({
  /** « Maintenant » vu par le serveur : alimente la pastille DIRECT. */
  maintenant: SchemaIsoDouala,
  depart: SchemaVille,
  arrivee: SchemaVille,
  /** Position détectée de l'utilisateur : ville et gares du trajet (Akwa → Yaoundé Mvan). */
  position: z
    .object({ ville: z.string(), gareDepart: z.string(), gareArrivee: z.string() })
    .optional(),
  jour: SchemaJour,
  filtres: z.object({
    classe: z.enum(["toutes", "vip", "classique"]),
    compagnies: z.number().int().nonnegative(),
    preferees: z.number().int().nonnegative(),
  }),
  departs: z.array(SchemaDepartVoyageur),
  covoits: z.array(SchemaCovoitDansListe),
  /** « 14 bus et 6 covoiturages aujourd'hui ». */
  totaux: z.object({
    bus: z.number().int().nonnegative(),
    covoiturages: z.number().int().nonnegative(),
  }),
  notificationColis: SchemaNotificationColis.optional(),
});
export type ResultatRechercheDeparts = z.infer<typeof SchemaResultatRechercheDeparts>;

/* ------------------------------------------------------------------ options de filtre */

export const SchemaOptionsFiltres = z.object({
  depart: SchemaVille,
  arrivee: SchemaVille,
  jour: SchemaJour,
  classes: z.array(
    z.object({ valeur: z.enum(["toutes", "vip", "classique"]), libelle: z.string() }),
  ),
  classeActive: z.enum(["toutes", "vip", "classique"]),
  compagnies: z.array(
    z.object({
      id: SchemaId,
      nom: z.string(),
      /** « VIP », « nuit »… */
      etiquette: z.string().optional(),
      departs: z.number().int().nonnegative(),
      coche: z.boolean(),
      preferee: z.boolean(),
    }),
  ),
  totalDeparts: z.number().int().nonnegative(),
  aussi: z.array(z.object({ code: z.string(), libelle: z.string(), actif: z.boolean() })),
});
export type OptionsFiltres = z.infer<typeof SchemaOptionsFiltres>;

export const SchemaEnregistrerFiltres = z.object({
  depart: z.string(),
  arrivee: z.string(),
  filtres: SchemaFiltresDeparts,
});
export type EnregistrerFiltres = z.infer<typeof SchemaEnregistrerFiltres>;

export const SchemaDefinirPreferee = z.object({ compagnieId: SchemaId, preferee: z.boolean() });
export type DefinirPreferee = z.infer<typeof SchemaDefinirPreferee>;

/* ------------------------------------------------------------------ dans la même ville */

export const SchemaTypeOffreVille = z.enum(["covoiturage", "moto_taxi", "bus_ville"]);
export type TypeOffreVille = z.infer<typeof SchemaTypeOffreVille>;

export const SchemaQuand = z.enum(["maintenant", "dans_1h", "chaque_matin"]);
export type Quand = z.infer<typeof SchemaQuand>;

export const SchemaRechercheVille = z.object({
  ville: z.string(),
  depart: z.string().optional(),
  arrivee: z.string().optional(),
  quand: SchemaQuand.optional(),
  types: z.array(SchemaTypeOffreVille).optional(),
});
export type RechercheVille = z.infer<typeof SchemaRechercheVille>;

export const SchemaOffreVille = z.object({
  id: SchemaId,
  type: SchemaTypeOffreVille,
  /** Heure de passage ou de départ. */
  departA: SchemaIsoDouala,
  /** Délai affiché (« 3 min ») : minutes entre « maintenant » et `departA`. */
  departDansMinutes: z.number().int().nonnegative(),
  /** Conducteur, ligne ou chauffeur (« Clarisse », « ligne 3 · Socatur »). */
  qui: z.string(),
  verifie: z.boolean(),
  note: z.number().min(0).max(5).optional(),
  /** Précision : véhicule, places, arrêt, durée. */
  detail: z.string(),
  dureeMinutes: z.number().int().positive().optional(),
  placesLibres: z.number().int().nonnegative().optional(),
  prix: SchemaFcfaPositif,
});
export type OffreVille = z.infer<typeof SchemaOffreVille>;

export const SchemaResultatRechercheVille = z.object({
  maintenant: SchemaIsoDouala,
  ville: z.object({ nom: z.string(), detectee: z.boolean() }),
  itineraire: z.object({
    depart: z.string(),
    arrivee: z.string(),
    /** Départ pris sur la position de l'utilisateur. */
    departSurMaPosition: z.boolean(),
    distanceKm: z.number().nonnegative(),
  }),
  quand: SchemaQuand,
  offres: z.array(SchemaOffreVille),
  /** Trajet régulier du matin proposé en haut du covoiturage en ville. */
  trajetDuMatin: SchemaTrajetRegulier.optional(),
});
export type ResultatRechercheVille = z.infer<typeof SchemaResultatRechercheVille>;

/* ------------------------------------------------------------------ détail d'un départ et plan de sièges */

export const SchemaDetailDepart = z.object({
  depart: SchemaDepartVoyageur,
  origine: z.object({ ville: SchemaVille, gare: z.string() }),
  destination: z.object({ ville: SchemaVille, gare: z.string() }),
  dureeMinutes: z.number().int().positive(),
  /** Durée du blocage d'un siège pendant la commande. */
  blocageMinutes: z.number().int().positive(),
});
export type DetailDepart = z.infer<typeof SchemaDetailDepart>;

export const SchemaEtatSiege = z.enum(["libre", "pris", "bloque", "a_moi"]);
export type EtatSiegeVue = z.infer<typeof SchemaEtatSiege>;

export const SchemaSiegeVue = z.object({
  numero: z.number().int().positive(),
  etat: SchemaEtatSiege,
  /** « côté fenêtre · près de la porte » */
  emplacement: z.string().optional(),
});
export type SiegeVue = z.infer<typeof SchemaSiegeVue>;

export const SchemaBlocageSiege = z.object({
  departId: SchemaId,
  siege: z.number().int().positive(),
  /** Fin du blocage : 15 minutes après la prise du siège. */
  jusqua: SchemaIsoDouala,
});
export type BlocageSiege = z.infer<typeof SchemaBlocageSiege>;

export const SchemaPlanSiegesVue = z.object({
  departId: SchemaId,
  capacite: z.number().int().positive(),
  sieges: z.array(SchemaSiegeVue),
  /** Places que je peux encore occuper : les sièges libres, plus celui que j'ai bloqué. */
  libres: z.number().int().nonnegative(),
  /** Siège que l'utilisateur est en train de payer, avec la fin de son blocage. */
  mon: SchemaBlocageSiege.optional(),
  /** Mis à jour par le serveur à chaque changement. */
  versionPlan: z.number().int().nonnegative(),
});
export type PlanSiegesVue = z.infer<typeof SchemaPlanSiegesVue>;

/** Messages du canal temps réel du plan de sièges. */
export const SchemaMessagePlanSieges = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan"), plan: SchemaPlanSiegesVue }),
  z.object({
    type: z.literal("siege"),
    departId: SchemaId,
    siege: z.number().int().positive(),
    etat: SchemaEtatSiege,
    jusqua: SchemaIsoDouala.optional(),
    versionPlan: z.number().int().nonnegative(),
  }),
]);
export type MessagePlanSieges = z.infer<typeof SchemaMessagePlanSieges>;

export const SchemaBloquerSiege = z.object({
  departId: SchemaId,
  siege: z.number().int().positive(),
});
export type BloquerSiege = z.infer<typeof SchemaBloquerSiege>;

/* ------------------------------------------------------------------ moyens de paiement et commande */

export const SchemaMoyenPaiementVue = z.object({
  code: SchemaMoyenPaiement,
  nom: z.string(),
  /** Sigle du moyen (MTN, OM) ; absent pour la carte et le proche. */
  sigle: z.string().optional(),
  /** Numéro utilisé, ou consigne (« tu confirmes sur ton téléphone »). */
  detail: z.string().optional(),
  choisi: z.boolean(),
});
export type MoyenPaiementVue = z.infer<typeof SchemaMoyenPaiementVue>;

export const SchemaPour = z.enum(["moi", "proche", "plusieurs"]);
export type Pour = z.infer<typeof SchemaPour>;

export const SchemaPassagerCommande = z.object({
  nom: z.string(),
  telephone: SchemaTelephone.optional(),
});
export type PassagerCommande = z.infer<typeof SchemaPassagerCommande>;

export const SchemaDemandeDevis = z.object({
  departId: SchemaId,
  places: z.number().int().positive().optional(),
  codePromo: z.string().optional(),
  /** Achat en ligne (frais de service) ; vrai par défaut. */
  enLigne: z.boolean().optional(),
});
export type DemandeDevis = z.infer<typeof SchemaDemandeDevis>;

export const SchemaCreerCommande = z.object({
  departId: SchemaId,
  /** Sièges choisis ; un seul pour « Pour moi ». */
  sieges: z.array(z.number().int().positive()).min(1),
  pour: SchemaPour,
  procheId: SchemaId.optional(),
  passagers: z.array(SchemaPassagerCommande).optional(),
  codePromo: z.string().optional(),
  /** Devise de paiement (« CAD » pour un proche à l'étranger) ; XAF par défaut. */
  devise: z.string().length(3).optional(),
});
export type CreerCommande = z.infer<typeof SchemaCreerCommande>;
