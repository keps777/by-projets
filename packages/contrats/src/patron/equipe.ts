import { z } from "zod";
import {
  EtatPersonneSchema,
  FcfaSchema,
  IdSchema,
  IsoDoualaSchema,
  JourSchema,
  PersonneResumeSchema,
  RefPersonneSchema,
  RoleEquipeSchema,
  TauxPctSchema,
} from "./commun";

/* ----------------------------------------------------------------------- mes gares, mes gens */

export const SynchroGareSchema = z.strictObject({
  guichetsSynchronises: z.number().int().nonnegative(),
  guichets: z.number().int().nonnegative(),
});

export const GareResumeSchema = z.strictObject({
  id: IdSchema,
  nom: z.string(),
  ville: z.string(),
  /** Nom du superviseur de la gare. */
  responsable: z.string(),
  nbGuichets: z.number().int().nonnegative(),
  nbQuais: z.number().int().nonnegative(),
  caisse: FcfaSchema,
  synchro: SynchroGareSchema,
  /** Somme des écarts de caisse ; `null` si la gare est hors ligne (inconnue). */
  ecartTotal: FcfaSchema.nullable(),
  /** Minutes sans synchronisation quand la gare est hors ligne. */
  horsLigneDepuisMinutes: z.number().int().positive().nullable(),
});
export type GareResume = z.infer<typeof GareResumeSchema>;

export const EffectifRoleSchema = z.strictObject({
  role: RoleEquipeSchema,
  nombre: z.number().int().nonnegative(),
  /** Nombre de personnes de ce rôle actuellement en service / à bord / en route. */
  enService: z.number().int().nonnegative(),
});
export type EffectifRole = z.infer<typeof EffectifRoleSchema>;

export const RepereEquipeSchema = z.strictObject({
  code: z.enum(["plus_regulier", "a_voir", "paie_du_mois"]),
  libelle: z.string(),
  valeur: z.string(),
});

/** Planche « Mes gares, mes gens » (`/(patron)/gares`). */
export const VueGaresSchema = z.strictObject({
  instant: IsoDoualaSchema,
  nbPersonnes: z.number().int(),
  nbBus: z.number().int(),
  enService: z.number().int(),
  gares: z.array(GareResumeSchema),
  effectifs: z.array(EffectifRoleSchema),
  /** Les personnes à suivre (extrait de l'équipe ; la liste complète est `ListeEquipe`). */
  personnes: z.array(PersonneResumeSchema),
  reperes: z.array(RepereEquipeSchema),
  paie: z.strictObject({
    nbSalaires: z.number().int(),
    jourDuMois: z.number().int().min(1).max(31),
    mode: z.literal("momo"),
  }),
});
export type VueGares = z.infer<typeof VueGaresSchema>;

/* ----------------------------------------------------------------------- une gare */

export const GuichetGareSchema = z.strictObject({
  rang: z.number().int().min(1),
  personne: RefPersonneSchema,
  sessionId: IdSchema.nullable(),
  billets: z.number().int().nonnegative(),
  colis: z.number().int().nonnegative(),
  caisse: FcfaSchema,
  ecart: FcfaSchema,
  etat: z.enum(["synchronise", "bloque", "hors_ligne"]),
  derniereSyncA: IsoDoualaSchema.nullable(),
  bloqueDepuis: IsoDoualaSchema.nullable(),
  /** La clôture de la session attend le PIN du superviseur. */
  clotureAttendPin: z.boolean(),
});

export const QuaiGareSchema = z.strictObject({
  departId: IdSchema,
  heureDepart: IsoDoualaSchema,
  origine: z.string(),
  destination: z.string(),
  bus: z.string(),
  chauffeur: z.string(),
  convoyeur: z.string().nullable(),
  remplis: z.number().int().nonnegative(),
  capacite: z.number().int().positive(),
  embarquementA: IsoDoualaSchema.nullable(),
  /** Mention libre (« 09:30 Oméga en face »). */
  note: z.string().nullable(),
});

export const EvenementGareSchema = z.strictObject({
  at: IsoDoualaSchema,
  texte: z.string(),
  etat: z.enum(["ouvert", "trace", "attend_pin"]),
  /** Billet ou session concerné. */
  cibleId: IdSchema.nullable(),
});

/** Planche « Une gare en détail » (`/(patron)/gares/[gareId]`). */
export const DetailGareSchema = z.strictObject({
  gare: z.strictObject({ id: IdSchema, nom: z.string(), ville: z.string() }),
  superviseur: z.string(),
  nbGuichets: z.number().int(),
  nbQuais: z.number().int(),
  instant: IsoDoualaSchema,
  synchro: SynchroGareSchema,
  chiffres: z.strictObject({
    caisse: FcfaSchema,
    caisseDepuis: IsoDoualaSchema,
    billets: z.number().int().nonnegative(),
    remplissagePct: TauxPctSchema,
    colis: z.number().int().nonnegative(),
    colisAuRelais: z.number().int().nonnegative(),
    ecart: FcfaSchema,
    /** Rang du guichet qui porte l'écart, s'il y en a un. */
    ecartGuichet: z.number().int().nullable(),
  }),
  guichets: z.array(GuichetGareSchema),
  quais: z.array(QuaiGareSchema),
  journal: z.array(EvenementGareSchema),
});
export type DetailGare = z.infer<typeof DetailGareSchema>;

/* ----------------------------------------------------------------------- une personne */

export const FichePersonneSchema = z.strictObject({
  personne: z.strictObject({
    id: IdSchema,
    nom: z.string(),
    initiales: z.string(),
    role: RoleEquipeSchema,
    lieu: z.string(),
    depuis: JourSchema,
    /** Numéro masqué (« 6 77 •• •• 23 »). */
    telephoneMasque: z.string(),
    operateur: z.enum(["MTN", "Orange"]),
    salaire: FcfaSchema,
    jourDePaie: z.number().int().min(1).max(31),
    superviseur: z.string(),
    etat: EtatPersonneSchema,
    enServiceDepuis: IsoDoualaSchema.nullable(),
  }),
  chiffres: z.strictObject({
    periodeJours: z.number().int().positive(),
    billets: z.number().int().nonnegative(),
    colis: z.number().int().nonnegative(),
    litiges: z.number().int().nonnegative(),
    annulations: z.number().int().nonnegative(),
    tauxAnnulationPct: z.number().nonnegative(),
    ecarts: z.strictObject({
      nombre: z.number().int().nonnegative(),
      total: FcfaSchema,
      /** Fenêtre de comptage des écarts, en jours. */
      sur: z.number().int().positive(),
    }),
  }),
  ecarts: z.strictObject({
    tolerance: FcfaSchema,
    /** Un point par jour, du plus ancien au plus récent ; 0 = pas d'écart. */
    jours: z.array(z.strictObject({ jour: JourSchema, ecart: FcfaSchema })),
    lecture: z.string(),
  }),
  journal: z.array(
    z.strictObject({
      quand: IsoDoualaSchema,
      cashCompte: FcfaSchema,
      cashAttendu: FcfaSchema,
      ecart: FcfaSchema,
      validePar: z.string(),
    }),
  ),
});
export type FichePersonne = z.infer<typeof FichePersonneSchema>;

/** Filtre de la liste de l'équipe. */
export const FiltreEquipeSchema = z.strictObject({
  role: RoleEquipeSchema.optional(),
  recherche: z.string().optional(),
  gareId: IdSchema.optional(),
});
export type FiltreEquipe = z.infer<typeof FiltreEquipeSchema>;

/** Planche « Liste de l'équipe » (pop-up des réglages) : filtre par rôle. */
export const ListeEquipeSchema = z.strictObject({
  total: z.number().int(),
  roles: z.array(z.strictObject({ role: RoleEquipeSchema, nombre: z.number().int() })),
  personnes: z.array(PersonneResumeSchema),
  resume: z.strictObject({
    role: RoleEquipeSchema.nullable(),
    total: z.number().int(),
    enService: z.number().int(),
    bloquees: z.number().int(),
  }),
});
export type ListeEquipe = z.infer<typeof ListeEquipeSchema>;
