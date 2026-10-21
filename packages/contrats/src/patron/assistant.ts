import { z } from "zod";
import {
  AccuseSigneSchema,
  FcfaSchema,
  HeureSchema,
  IdSchema,
  IsoDoualaSchema,
  TauxPctSchema,
  commandeSignee,
} from "./commun";

/* ----------------------------------------------------------------------- insights */

/** Une action que l'assistant propose (« Contrôle inopiné mardi »). */
export const ActionAssistantSchema = z.strictObject({
  id: IdSchema,
  libelle: z.string(),
  /**
   * Ce que l'action change : un réglage (donc **signé par le PIN** via `appliquer`), ou une simple
   * navigation.
   */
  type: z.enum([
    "controle_inopine",
    "regle_cadence_numero",
    "decaler_depart",
    "ajouter_depart",
    "voir_ligne",
  ]),
  /**
   * La ligne concernée, pour `voir_ligne` et `ajouter_depart` : l'écran ouvre directement l'analyse ou le réglage
   * de cette ligne. Absent, l'écran ouvre la liste des lignes (ou les réglages).
   */
  ligneId: IdSchema.optional(),
});
export type ActionAssistant = z.infer<typeof ActionAssistantSchema>;

export const RemplissageSimuleSchema = z.strictObject({
  libelle: z.string(),
  remplis: z.number().int().nonnegative(),
  capacite: z.number().int().positive(),
});

export const SimulationHoraireSchema = z.strictObject({
  scenarios: z.array(RemplissageSimuleSchema),
  gainMensuel: FcfaSchema,
});
export type SimulationHoraire = z.infer<typeof SimulationHoraireSchema>;

/** « Argent qui fuit » : une anomalie récurrente repérée sur les chiffres. */
export const FuiteSchema = z.strictObject({
  id: IdSchema,
  periodeJours: z.number().int().positive(),
  constat: z.string(),
  explication: z.string(),
  /** Montant cumulé de la fuite (négatif), si l'assistant sait le chiffrer. */
  montantTotal: FcfaSchema.nullable(),
  /** Jours (1 = le plus ancien) où l'anomalie s'est produite. */
  joursConcernes: z.array(z.number().int().positive()),
  actions: z.array(ActionAssistantSchema),
});

/** « Argent à gagner » : une simulation d'horaire ou de prix. */
export const GainSchema = z.strictObject({
  id: IdSchema,
  constat: z.string(),
  simulation: SimulationHoraireSchema,
  /** Sur quelles données la simulation repose. */
  base: z.string(),
  action: ActionAssistantSchema,
});

export const InsightsAssistantSchema = z.strictObject({
  fuites: z.array(FuiteSchema),
  gains: z.array(GainSchema),
  questionsSuggerees: z.array(z.string()),
});
export type InsightsAssistant = z.infer<typeof InsightsAssistantSchema>;

/* ----------------------------------------------------------------------- question libre */

export const QuestionAssistantSchema = z.strictObject({
  question: z.string().trim().min(1).max(500),
});
export type QuestionAssistant = z.infer<typeof QuestionAssistantSchema>;

export const OptionSimuleeSchema = z.strictObject({
  libelle: z.string(),
  gainMensuel: FcfaSchema,
});

/**
 * Le graphique d'une réponse détaillée (« pourquoi cette ligne baisse ») : une barre par jour de la période
 * comparée, le plus ancien d'abord.
 */
export const GraphiqueReponseSchema = z.strictObject({
  /** Remplissage de la ligne ce jour-là, en % (0 à 100). */
  valeurs: z.array(TauxPctSchema),
  /** Rangs (1 = le plus ancien) des jours en écart, que l'écran met en rouge. */
  joursEnEcart: z.array(z.number().int().positive()),
});
export type GraphiqueReponse = z.infer<typeof GraphiqueReponseSchema>;

export const ReponseAssistantSchema = z.strictObject({
  question: z.string(),
  repondueA: IsoDoualaSchema,
  dureeSecondes: z.number().int().nonnegative(),
  /** Résumé en une ou deux phrases. */
  resume: z.string(),
  /** Points numérotés de l'explication (vide quand la réponse tient dans le résumé). */
  points: z.array(z.string()),
  actions: z.array(ActionAssistantSchema),
  /** Les sources citées : jamais les chiffres d'une autre compagnie. */
  sources: z.string().nullable(),
  simulation: z.strictObject({ options: z.array(OptionSimuleeSchema) }).nullable(),
  /** Le graphique du diagnostic ; absent quand la réponse n'en a pas. */
  graphique: GraphiqueReponseSchema.optional(),
});
export type ReponseAssistant = z.infer<typeof ReponseAssistantSchema>;

export const ConversationAssistantSchema = z.strictObject({
  id: IdSchema,
  /** Fenêtre de données lue par l'assistant, en jours. */
  baseJours: z.number().int().positive(),
  echanges: z.array(ReponseAssistantSchema),
});
export type ConversationAssistant = z.infer<typeof ConversationAssistantSchema>;

/* ----------------------------------------------------------------------- simulation */

export const DemandeSimulationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("horaire"),
    departId: IdSchema,
    nouvelleHeure: HeureSchema,
  }),
  z.strictObject({
    type: z.literal("prix"),
    departId: IdSchema,
    nouveauPrix: z.number().int().positive(),
  }),
]);
export type DemandeSimulation = z.infer<typeof DemandeSimulationSchema>;

export const ResultatSimulationSchema = z.strictObject({
  demande: DemandeSimulationSchema,
  simulation: SimulationHoraireSchema,
  base: z.string(),
});
export type ResultatSimulation = z.infer<typeof ResultatSimulationSchema>;

/* ----------------------------------------------------------------------- appliquer */

/** Appliquer une proposition de l'assistant modifie un réglage : le PIN est obligatoire. */
export const AppliquerPropositionSchema = commandeSignee({
  actionId: IdSchema,
});
export type AppliquerProposition = z.infer<typeof AppliquerPropositionSchema>;

export const PropositionAppliqueeSchema = AccuseSigneSchema.extend({
  actionId: IdSchema,
  /** Effet à partir de cet instant (« dès lundi »). */
  effetA: IsoDoualaSchema,
});
export type PropositionAppliquee = z.infer<typeof PropositionAppliqueeSchema>;
