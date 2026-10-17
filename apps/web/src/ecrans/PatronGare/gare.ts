import type { patron } from "@afrimove/api-client";

/** Ce que `useGare` renvoie (@afrimove/contrats n'est pas une dépendance de l'application). */
export type DetailGare = NonNullable<ReturnType<typeof patron.useGare>["data"]>;
export type GuichetGare = DetailGare["guichets"][number];
export type QuaiGare = DetailGare["quais"][number];
export type EvenementGare = DetailGare["journal"][number];
