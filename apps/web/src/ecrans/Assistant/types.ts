import type { patron } from "@afrimove/api-client";

/** Ce que `useInsightsAssistant` renvoie (le contrat `InsightsAssistant`, déjà validé par le client). */
export type Insights = NonNullable<ReturnType<typeof patron.useInsightsAssistant>["data"]>;
export type Fuite = Insights["fuites"][number];
export type Gain = Insights["gains"][number];
export type ActionAssistant = Fuite["actions"][number];
