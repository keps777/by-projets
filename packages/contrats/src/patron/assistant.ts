import { z } from "zod";
import {
  AccuseSigneSchema,
  FcfaSchema,
  HeureSchema,
  IdSchema,
  IsoDoualaSchema,
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
