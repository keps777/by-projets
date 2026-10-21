import { z } from "zod";
import { SchemaFcfaPositif, SchemaId, SchemaIsoDouala } from "./commun";

/* ------------------------------------------------------------------ recherche (passager) */

export const SchemaFiltreCovoit = z.enum(["clim", "femmes", "grand_bagage", "prix_max"]);
export type FiltreCovoit = z.infer<typeof SchemaFiltreCovoit>;

export const SchemaRechercheCovoit = z.object({
  /** Noms ou codes des villes (Douala, Kribi). */
  depart: z.string(),
  arrivee: z.string(),
  /** Début de la plage de départ (« ce matin »). */
  apartirDe: SchemaIsoDouala.optional(),
  filtres: z.array(SchemaFiltreCovoit).optional(),
  prixMax: SchemaFcfaPositif.optional(),
});
export type RechercheCovoit = z.infer<typeof SchemaRechercheCovoit>;

export const SchemaConducteurCovoit = z.object({
  id: SchemaId,
  /** « Samuel E. » */
  nom: z.string(),
  initiales: z.string(),
  verifie: z.boolean(),
  note: z.number().min(0).max(5).optional(),
  trajets: z.number().int().nonnegative().optional(),
});
export type ConducteurCovoit = z.infer<typeof SchemaConducteurCovoit>;

export const SchemaOffreCovoit = z.object({
  id: SchemaId,
  conducteur: SchemaConducteurCovoit,
  /** « Toyota Corolla grise » */
  vehicule: z.string(),
  immatriculation: z.string().optional(),
  clim: z.boolean(),
  femmesBienvenues: z.boolean(),
  grandBagage: z.boolean(),
  placesLibres: z.number().int().nonnegative(),
  /** Prix d'une place, sans les frais AfriMove. */
  prixParPlace: SchemaFcfaPositif,
  departA: SchemaIsoDouala,
  lieuDepart: z.string(),
  dureeMinutes: z.number().int().positive().optional(),
  arriveeEstimee: SchemaIsoDouala.optional(),
  lieuArrivee: z.string().optional(),
  arretsPossibles: z.number().int().nonnegative().optional(),
  /** Phrase de garantie (« Payé dans l'app · remboursé si Samuel annule »). */
  garantie: z.string().optional(),
});
export type OffreCovoit = z.infer<typeof SchemaOffreCovoit>;

export const SchemaResultatRechercheCovoit = z.object({
  maintenant: SchemaIsoDouala,
  ville: z.string(),
  depart: z.string(),
  arrivee: z.string(),
  offres: z.array(SchemaOffreCovoit),
  /** Conducteurs vérifiés (pièce, permis, voiture) ; argent libéré à l'arrivée. */
  note: z.string(),
});
export type ResultatRechercheCovoit = z.infer<typeof SchemaResultatRechercheCovoit>;

export const SchemaReserverCovoit = z.object({
  offreId: SchemaId,
  places: z.number().int().positive(),
});
export type ReserverCovoit = z.infer<typeof SchemaReserverCovoit>;

/* ------------------------------------------------------------------ publication (conducteur) */

export const SchemaOptionCovoit = z.object({
  code: z.string(),
  libelle: z.string(),
  actif: z.boolean(),
});
export type OptionCovoit = z.infer<typeof SchemaOptionCovoit>;

export const SchemaFormulairePublication = z.object({
  conducteur: SchemaConducteurCovoit,
  vehicule: z.string(),
  immatriculation: z.string(),
  depart: z.object({ ville: z.string(), point: z.string() }),
  arrivee: z.object({ ville: z.string(), point: z.string() }),
  departA: SchemaIsoDouala,
  places: z.object({
    choix: z.array(z.number().int().positive()),
    choisi: z.number().int().positive(),
  }),
  prixParPlace: SchemaFcfaPositif,
  /** Fourchette conseillée : du partage de frais, pas de bénéfice. */
  prixConseille: z.object({ min: SchemaFcfaPositif, max: SchemaFcfaPositif }),
  /** Part gardée par AfriMove, par place. */
  fraisParPlace: SchemaFcfaPositif,
  options: z.array(SchemaOptionCovoit),
  reputation: z.object({
    trajets: z.number().int().nonnegative(),
    note: z.number().min(0).max(5),
    piecesVerifiees: z.array(z.string()),
  }),
});
export type FormulairePublication = z.infer<typeof SchemaFormulairePublication>;

export const SchemaPublierTrajet = z.object({
  depart: z.object({ ville: z.string(), point: z.string() }),
  arrivee: z.object({ ville: z.string(), point: z.string() }),
  departA: SchemaIsoDouala,
  places: z.number().int().positive(),
  prixParPlace: SchemaFcfaPositif,
  options: z.array(z.string()),
  /** Trajet répété chaque semaine. */
  regulier: z.boolean().optional(),
});
export type PublierTrajet = z.infer<typeof SchemaPublierTrajet>;

export const SchemaTrajetPublie = z.object({
  id: SchemaId,
  departA: SchemaIsoDouala,
  depart: z.string(),
  arrivee: z.string(),
  places: z.number().int().nonnegative(),
  placesReservees: z.number().int().nonnegative(),
  /** Prix d'une place, quand l'écran le montre. */
  prixParPlace: SchemaFcfaPositif.optional(),
  /** Passagers qui ont réservé (« Aïcha N. · payée 4 000 »). */
  reservations: z.array(
    z.object({
      passager: z.string(),
      places: z.number().int().positive(),
      montantPaye: SchemaFcfaPositif,
    }),
  ),
  /** Voyageurs qui voient le trajet. */
  visiblePar: z.number().int().nonnegative().optional(),
});
export type TrajetPublie = z.infer<typeof SchemaTrajetPublie>;

export const SchemaDemandePassager = z.object({
  id: SchemaId,
  passager: z.string(),
  note: z.number().min(0).max(5).optional(),
  depart: z.string(),
  arrivee: z.string(),
  /** Quand le passager cherche (« dimanche matin »). */
  quand: z.string(),
  places: z.number().int().positive(),
  /** Trajet publié qui répond à la demande, proposé en un geste. */
  trajetPropose: SchemaId,
  heurePropose: z.string().regex(/^\d{2}:\d{2}$/),
});
export type DemandePassager = z.infer<typeof SchemaDemandePassager>;

export const SchemaMesTrajetsCovoit = z.object({
  conducteur: SchemaConducteurCovoit,
  resume: z.object({
    gainSemaine: SchemaFcfaPositif,
    trajets: z.number().int().nonnegative(),
    annulations: z.number().int().nonnegative(),
    piecesOk: z.boolean(),
  }),
  publies: z.array(SchemaTrajetPublie),
  demandes: z.array(SchemaDemandePassager),
  /** Le conducteur est payé à l'arrivée, par MoMo. */
  fraisParPlace: SchemaFcfaPositif,
});
export type MesTrajetsCovoit = z.infer<typeof SchemaMesTrajetsCovoit>;

export const SchemaProposerADemande = z.object({
  demandeId: SchemaId,
  trajetId: SchemaId,
});
export type ProposerADemande = z.infer<typeof SchemaProposerADemande>;

export const SchemaResultatProposition = z.object({
  demandeId: SchemaId,
  trajetId: SchemaId,
  envoyee: z.boolean(),
});
export type ResultatProposition = z.infer<typeof SchemaResultatProposition>;

/* ------------------------------------------------------------------ trajet régulier en ville */

export const SchemaTrajetRegulier = z.object({
  libelle: z.string(),
  departA: z.string().regex(/^\d{2}:\d{2}$/),
  actif: z.boolean(),
  explication: z.string(),
});
export type TrajetRegulier = z.infer<typeof SchemaTrajetRegulier>;

export const SchemaDefinirTrajetRegulier = z.object({ actif: z.boolean() });
export type DefinirTrajetRegulier = z.infer<typeof SchemaDefinirTrajetRegulier>;
