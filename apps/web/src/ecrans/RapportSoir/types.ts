import type { patron } from "@afrimove/api-client";

/** Ce que `useRapportSoir` renvoie (le contrat `RapportSoir` d'AM-171, déjà validé par le client). */
export type RapportSoir = NonNullable<ReturnType<typeof patron.useRapportSoir>["data"]>;
export type RapportGare = RapportSoir["gares"][number];
