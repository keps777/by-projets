import { z } from "zod";
import {
  AccuseSigneSchema,
  FcfaPositifSchema,
  FcfaSchema,
  HeureSchema,
  IdSchema,
  IsoDoualaSchema,
  JourSchema,
  OperateurMomoSchema,
  PersonneResumeSchema,
  RoleEquipeSchema,
  commandeSignee,
} from "./commun";

/**
 * Réglages du patron. **Toute écriture ici est une `commandeSignee`** : sans signature PIN valide
 * le contrat refuse le corps (voir `commandes.ts` et ses tests).
 */

export const TarifsSchema = z.strictObject({
  classique: FcfaPositifSchema,
  vip: FcfaPositifSchema,
  bagage: FcfaPositifSchema,
});
export type Tarifs = z.infer<typeof TarifsSchema>;

/* ----------------------------------------------------------------------- règles de l'agence */

export const DelaiAnnulationGratuiteSchema = z.enum([
  "1h_avant",
  "2h_avant",
  "veille_20h",
  "jamais",
]);
export const RetenueAnnulationSchema = z.enum([
  "selon_classe",
  "dix_pct",
  "cinquante_pct",
  "aucun_remboursement",
]);
export const AuDelaToleranceSchema = z.enum([
  "pin_superviseur_et_patron",
  "pin_superviseur",
  "bloque_guichet",
]);

export const ReglesAgenceSchema = z.strictObject({
  annulation: z.strictObject({
    gratuiteJusqua: DelaiAnnulationGratuiteSchema,
    retenue: RetenueAnnulationSchema,
    /** Retenue par classe quand `retenue` vaut `selon_classe` (en %, entiers). */
    retenueParClassePct: z.strictObject({
      classique: z.number().int().min(0).max(100),
      vip: z.number().int().min(0).max(100),
    }),
  }),
  caisse: z.strictObject({
    toleranceEcart: FcfaPositifSchema,
    auDela: AuDelaToleranceSchema,
  }),
  cadence: z.strictObject({ numeroObligatoire: z.boolean() }),
  fraisService: z.strictObject({
    montant: FcfaPositifSchema,
    priseEnChargeParAgence: z.boolean(),
  }),
  comptesMomo: z.strictObject({
    mtn: z.strictObject({ numeroMasque: z.string() }),
    orange: z.strictObject({ numeroMasque: z.string() }),
  }),
});
export type ReglesAgence = z.infer<typeof ReglesAgenceSchema>;

/** Les règles modifiables d'un coup (les comptes MoMo ont leur propre commande, plus stricte). */
export const ReglesModifiablesSchema = ReglesAgenceSchema.omit({ comptesMomo: true });
export type ReglesModifiables = z.infer<typeof ReglesModifiablesSchema>;

export const EnregistrerReglesSchema = commandeSignee({ regles: ReglesModifiablesSchema });
export type EnregistrerRegles = z.infer<typeof EnregistrerReglesSchema>;

export const ReglesEnregistreesSchema = AccuseSigneSchema.extend({ regles: ReglesAgenceSchema });
export type ReglesEnregistrees = z.infer<typeof ReglesEnregistreesSchema>;

/* ----------------------------------------------------------------------- comptes MoMo */

/**
 * Changer un compte marchand exige le PIN **et** le code reçu par SMS sur l'ancien numéro.
 * Étape 1 : demander le SMS.
 */
export const DemanderConfirmationCompteMomoSchema = commandeSignee({
  operateur: OperateurMomoSchema,
  nouveauNumero: z.string().regex(/^\+?\d{9,15}$/),
});
export type DemanderConfirmationCompteMomo = z.infer<typeof DemanderConfirmationCompteMomoSchema>;

export const ConfirmationCompteMomoEnvoyeeSchema = z.strictObject({
  /** Ancien numéro, masqué, qui a reçu le SMS. */
  envoyeA: z.string(),
  expireA: IsoDoualaSchema,
});
export type ConfirmationCompteMomoEnvoyee = z.infer<typeof ConfirmationCompteMomoEnvoyeeSchema>;

/** Étape 2 : changer le compte avec le code reçu. Les ventes en cours restent sur l'ancien jusqu'à minuit. */
export const ChangerCompteMomoSchema = commandeSignee({
  operateur: OperateurMomoSchema,
  nouveauNumero: z.string().regex(/^\+?\d{9,15}$/),
  codeSms: z.string().regex(/^\d{6}$/),
});
export type ChangerCompteMomo = z.infer<typeof ChangerCompteMomoSchema>;

export const CompteMomoChangeSchema = AccuseSigneSchema.extend({
  operateur: OperateurMomoSchema,
  numeroMasque: z.string(),
  /** Les ventes en cours restent sur l'ancien compte jusqu'à cet instant (minuit). */
  effetA: IsoDoualaSchema,
});
export type CompteMomoChange = z.infer<typeof CompteMomoChangeSchema>;

/* ----------------------------------------------------------------------- accueil des réglages */

export const LigneReglageSchema = z.strictObject({
  id: IdSchema,
  nom: z.string(),
  nbDeparts: z.number().int().nonnegative(),
  tarifs: TarifsSchema,
  /** Arrêts en route (sans l'origine ni le terminus). */
  arrets: z.array(z.string()),
  /** Proposition de l'assistant en attente (« 10:00 → 09:15 »), sinon `null`. */
  propositionAssistant: z.string().nullable(),
});

export const EffectifReglageSchema = z.strictObject({
  role: RoleEquipeSchema,
  nombre: z.number().int().nonnegative(),
});

export const ReglagesSchema = z.strictObject({
  lignes: z.array(LigneReglageSchema),
  equipe: z.strictObject({
    total: z.number().int(),
    effectifs: z.array(EffectifReglageSchema),
    /** Extrait de l'équipe (la liste filtrable est `ListeEquipe`). */
    apercu: z.array(PersonneResumeSchema),
  }),
  regles: ReglesAgenceSchema,
});
export type Reglages = z.infer<typeof ReglagesSchema>;

/* ----------------------------------------------------------------------- une ligne */

export const DepartEditableSchema = z.strictObject({
  /** `null` pour un départ qui vient d'être ajouté. */
  id: IdSchema.nullable(),
  heure: HeureSchema,
  /** Heure avant modification, quand elle change. */
  heureInitiale: HeureSchema.nullable(),
  classe: z.enum(["classique", "vip"]),
  prix: FcfaPositifSchema,
  actif: z.boolean(),
  /** « mardi seulement », « soute colis »… */
  note: z.string().nullable(),
  /** Jours de circulation : vide = tous les jours. */
  jours: z.array(z.enum(["lun", "mar", "mer", "jeu", "ven", "sam", "dim"])),
  nouveau: z.boolean(),
});
export type DepartEditable = z.infer<typeof DepartEditableSchema>;

export const ArretEditableSchema = z.strictObject({
  nom: z.string().min(1),
  /** Prix du tronçon depuis l'origine, au prorata des kilomètres (calculé par l'API). */
  prorata: FcfaPositifSchema,
  montee: z.boolean(),
});

export const PlanSiegesLigneSchema = z.strictObject({
  capacite: z.number().int().positive(),
  disposition: z.string().regex(/^\d(\+\d)+$/),
  rangees: z.number().int().positive(),
});

export const OptionsLigneSchema = z.strictObject({
  venteEnLigne: z.boolean(),
  fusionAuto: z.boolean(),
});

export const LigneEditableSchema = z.strictObject({
  id: IdSchema,
  nom: z.string(),
  departs: z.array(DepartEditableSchema),
  tarifs: TarifsSchema,
  arrets: z.array(ArretEditableSchema),
  plan: PlanSiegesLigneSchema,
  options: OptionsLigneSchema,
  /** Modifications non encore publiées. */
  brouillon: z.strictObject({
    modifications: z.number().int().nonnegative(),
    publicationA: IsoDoualaSchema.nullable(),
  }),
});
export type LigneEditable = z.infer<typeof LigneEditableSchema>;

/** Publier les modifications d'une ligne (départs, tarifs, arrêts, plan de sièges, options). */
export const ModifierLigneSchema = commandeSignee({
  ligneId: IdSchema,
  departs: z.array(DepartEditableSchema).optional(),
  tarifs: TarifsSchema.optional(),
  arrets: z.array(ArretEditableSchema.omit({ prorata: true })).optional(),
  plan: PlanSiegesLigneSchema.optional(),
  options: OptionsLigneSchema.optional(),
  /** Jour d'effet (« dès lundi ») ; immédiat si absent. */
  effetDu: JourSchema.optional(),
});
export type ModifierLigne = z.infer<typeof ModifierLigneSchema>;

export const LignePublieeSchema = AccuseSigneSchema.extend({ ligne: LigneEditableSchema });
export type LignePubliee = z.infer<typeof LignePublieeSchema>;

export const CreerLigneSchema = commandeSignee({
  origineGareId: IdSchema,
  destinationGareId: IdSchema,
  tarifs: TarifsSchema,
  arrets: z.array(z.string().min(1)),
  capacite: z.number().int().positive(),
});
export type CreerLigne = z.infer<typeof CreerLigneSchema>;

/* ----------------------------------------------------------------------- une personne */

export const DroitsPersonneSchema = z.strictObject({
  vendreBilletsEtColis: z.boolean(),
  annulerSansPinSuperviseur: z.boolean(),
  modeCadence: z.boolean(),
  voirCaissesDesAutres: z.boolean(),
});
export type DroitsPersonne = z.infer<typeof DroitsPersonneSchema>;

export const PersonneEditableSchema = z.strictObject({
  id: IdSchema,
  nom: z.string().min(1),
  /** Numéro complet qui reçoit le PIN, au format international. */
  telephone: z.string().regex(/^\+\d{9,15}$/),
  operateur: z.enum(["MTN", "Orange"]),
  role: RoleEquipeSchema,
  gareId: IdSchema.nullable(),
  /** « 1 », « 2 », « 3 » ou « nuit » ; `null` hors guichet. */
  guichet: z.string().nullable(),
  salaire: FcfaPositifSchema,
  depuis: JourSchema,
  actif: z.boolean(),
  droits: DroitsPersonneSchema,
});
export type PersonneEditable = z.infer<typeof PersonneEditableSchema>;

const ChampsPersonneSchema = z.strictObject({
  nom: z.string().min(1),
  telephone: z.string().regex(/^\+\d{9,15}$/),
  operateur: z.enum(["MTN", "Orange"]),
  role: RoleEquipeSchema,
  gareId: IdSchema.nullable(),
  guichet: z.string().nullable(),
  salaire: FcfaPositifSchema,
  droits: DroitsPersonneSchema,
});

export const ModifierPersonneSchema = commandeSignee({
  personneId: IdSchema,
  champs: ChampsPersonneSchema.partial(),
});
export type ModifierPersonne = z.infer<typeof ModifierPersonneSchema>;

/** Ajouter quelqu'un : même écran, champs vides ; il reçoit son PIN provisoire par SMS. */
export const CreerPersonneSchema = commandeSignee({ champs: ChampsPersonneSchema });
export type CreerPersonne = z.infer<typeof CreerPersonneSchema>;

export const PersonneEnregistreeSchema = AccuseSigneSchema.extend({
  personne: PersonneEditableSchema,
  /** Un PIN provisoire a été envoyé par SMS (création uniquement). */
  pinProvisoireEnvoye: z.boolean(),
});
export type PersonneEnregistree = z.infer<typeof PersonneEnregistreeSchema>;

export const DesactiverPersonneSchema = commandeSignee({ personneId: IdSchema });
export type DesactiverPersonne = z.infer<typeof DesactiverPersonneSchema>;

export const PersonneDesactiveeSchema = AccuseSigneSchema.extend({
  personneId: IdSchema,
  desactiveeA: IsoDoualaSchema,
});
export type PersonneDesactivee = z.infer<typeof PersonneDesactiveeSchema>;

/** Nouveau PIN provisoire envoyé par SMS (valable 1 h). */
export const NouveauPinProvisoireSchema = commandeSignee({ personneId: IdSchema });
export type NouveauPinProvisoire = z.infer<typeof NouveauPinProvisoireSchema>;

export const PinProvisoireEnvoyeSchema = AccuseSigneSchema.extend({
  personneId: IdSchema,
  valableJusqua: IsoDoualaSchema,
});
export type PinProvisoireEnvoye = z.infer<typeof PinProvisoireEnvoyeSchema>;

/* ----------------------------------------------------------------------- paie */

/** Payer les salaires du mois par MoMo en une touche : un décaissement, donc signé. */
export const LancerPaieSchema = commandeSignee({
  /** Mois de paie `AAAA-MM`. */
  mois: z.string().regex(/^\d{4}-\d{2}$/),
});
export type LancerPaie = z.infer<typeof LancerPaieSchema>;

export const PaieLanceeSchema = AccuseSigneSchema.extend({
  mois: z.string(),
  nbSalaires: z.number().int().nonnegative(),
  total: FcfaSchema.nullable(),
  versementA: IsoDoualaSchema,
});
export type PaieLancee = z.infer<typeof PaieLanceeSchema>;
