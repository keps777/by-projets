import { z } from "zod";
import {
  FcfaSchema,
  HeureSchema,
  IdSchema,
  PeriodeAnalyseSchema,
  TauxPctSchema,
  VariationPctSchema,
} from "./commun";

/** Point d'une série de recette (un jour de la semaine, une semaine du mois…). */
export const PointRecetteSchema = z.strictObject({
  /** « L », « M »… ou « S41 » : étiquette courte de l'axe. */
  libelle: z.string(),
  recette: FcfaSchema,
});

/** Point d'une série de net (une semaine, un mois). */
export const PointNetSchema = z.strictObject({ libelle: z.string(), net: FcfaSchema });

export const LigneAnalyseeSchema = z.strictObject({
  ligneId: IdSchema,
  nom: z.string(),
  remplissagePct: TauxPctSchema,
  recette: FcfaSchema,
});

export const BusAnalyseSchema = z.strictObject({
  busId: IdSchema,
  immatriculation: z.string(),
  chauffeur: z.string(),
  trajets: z.number().int().nonnegative(),
  net: FcfaSchema,
  /** « 0 incident », « 2 pannes », « pneus à changer »… */
  incident: z.string(),
});

export const ParamsAnalysesSchema = z.strictObject({ periode: PeriodeAnalyseSchema });
export type ParamsAnalyses = z.infer<typeof ParamsAnalysesSchema>;

/** Analyses (`/(patron)/analyses`) : recette par jour, remplissage par ligne, net par bus. */
export const AnalysesSchema = z.strictObject({
  periode: PeriodeAnalyseSchema,
  /** « Semaine du 29 déc. au 4 janv. » */
  libelle: z.string(),
  nbGares: z.number().int(),
  recette: z.strictObject({
    total: FcfaSchema,
    variationPct: VariationPctSchema,
    serie: z.array(PointRecetteSchema),
    lecture: z.string(),
  }),
  lignes: z.array(LigneAnalyseeSchema),
  colis: z.strictObject({ nombre: z.number().int().nonnegative(), recette: FcfaSchema }),
  bus: z.array(BusAnalyseSchema),
});
export type Analyses = z.infer<typeof AnalysesSchema>;

/* ----------------------------------------------------------------------- une ligne */

export const ParamsAnalyseLigneSchema = z.strictObject({
  ligneId: IdSchema,
  periode: PeriodeAnalyseSchema.optional(),
});
export type ParamsAnalyseLigne = z.infer<typeof ParamsAnalyseLigneSchema>;

export const DepartAnalyseSchema = z.strictObject({
  departId: IdSchema,
  heure: HeureSchema,
  classe: z.enum(["classique", "vip"]),
  prix: FcfaSchema,
  bus: z.string().nullable(),
  /** « soute colis », « clim »… */
  note: z.string().nullable(),
  remplissagePct: TauxPctSchema,
  concurrent: z
    .strictObject({ compagnie: z.string(), heure: HeureSchema, prix: FcfaSchema })
    .nullable(),
});

export const AnalyseLigneSchema = z.strictObject({
  ligne: z.strictObject({ id: IdSchema, nom: z.string() }),
  periode: PeriodeAnalyseSchema,
  libelle: z.string(),
  departsParJour: z.number().int().positive(),
  recette: z.strictObject({ total: FcfaSchema, variationPct: VariationPctSchema }),
  billets: z.strictObject({ nombre: z.number().int(), departs: z.number().int() }),
  remplissage: z.strictObject({ pct: TauxPctSchema, cible: TauxPctSchema }),
  colis: z.strictObject({ nombre: z.number().int(), variationPct: VariationPctSchema }),
  departs: z.array(DepartAnalyseSchema),
  parJour: z.strictObject({ serie: z.array(PointRecetteSchema), lecture: z.string() }),
  canaux: z.strictObject({
    enLigne: z.strictObject({
      partPct: z.number(),
      billets: z.number().int(),
      variationPts: z.number(),
    }),
    enRoute: z.strictObject({
      billets: z.number().int(),
      arrets: z.array(z.string()),
      tousEnregistres: z.boolean(),
    }),
  }),
});
export type AnalyseLigne = z.infer<typeof AnalyseLigneSchema>;

/* ----------------------------------------------------------------------- un bus */

export const ParamsAnalyseBusSchema = z.strictObject({ busId: IdSchema });
export type ParamsAnalyseBus = z.infer<typeof ParamsAnalyseBusSchema>;

export const TrajetBusSchema = z.strictObject({
  jour: z.enum(["lun", "mar", "mer", "jeu", "ven", "sam", "dim"]),
  heure: HeureSchema,
  origine: z.string(),
  destination: z.string(),
  passagers: z
    .strictObject({ remplis: z.number().int(), capacite: z.number().int().positive() })
    .nullable(),
  recette: FcfaSchema.nullable(),
  retardMinutes: z.number().int().nonnegative().nullable(),
  incident: z
    .strictObject({
      nature: z.enum(["panne", "autre"]),
      description: z.string(),
      dureeMinutes: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
  net: FcfaSchema,
});

export const AnalyseBusSchema = z.strictObject({
  bus: z.strictObject({
    id: IdSchema,
    immatriculation: z.string(),
    modele: z.string(),
    capacite: z.number().int().positive(),
    annee: z.number().int(),
  }),
  chauffeur: z.strictObject({ id: IdSchema.nullable(), nom: z.string() }),
  statut: z.enum(["ok", "a_surveiller"]),
  trajetsSemaine: z.number().int(),
  recette: z.strictObject({
    total: FcfaSchema,
    trajets: z.number().int(),
    remplissagePct: TauxPctSchema,
  }),
  depenses: z.strictObject({ total: FcfaSchema, carburant: FcfaSchema, pannes: FcfaSchema }),
  net: FcfaSchema,
  netMoyenFlotte: FcfaSchema,
  netParSemaine: z.strictObject({
    serie: z.array(PointNetSchema),
    variationPct: VariationPctSchema,
    /** Événement qui explique la tendance (« panne du 12 nov. »). */
    depuis: z.string().nullable(),
  }),
  trajets: z.array(TrajetBusSchema),
  avisAssistant: z.string(),
});
export type AnalyseBus = z.infer<typeof AnalyseBusSchema>;
