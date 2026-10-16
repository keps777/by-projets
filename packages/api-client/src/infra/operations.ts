import type { z } from "zod";
import { ErreurValidation } from "./erreurs";

export type MethodeHttp = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ValeurRequete = string | number | boolean | undefined;

/**
 * Une opération de l'API : son contrat (méthode, chemin, schéma de réponse) vit ici une seule fois,
 * et sert aux deux adaptateurs. `P` = paramètres, `R` = réponse validée.
 */
export interface Operation<P = void, R = unknown> {
  /** Nom unique, utilisé comme clé de cache et pour retrouver l'implémentation mock. */
  readonly nom: string;
  readonly methode: MethodeHttp;
  /** Chemin relatif à la base de l'API, par exemple `/departs/abc`. */
  readonly chemin: (params: P) => string;
  readonly requete?: (params: P) => Readonly<Record<string, ValeurRequete>>;
  readonly corps?: (params: P) => unknown;
  readonly reponse: z.ZodType<R>;
  /** Peut-on rejouer la requête sans effet de bord ? Seules ces opérations sont relancées. */
  readonly idempotente: boolean;
}

export type DefinitionOperation<P, R> = Omit<Operation<P, R>, "idempotente"> & {
  /** Par défaut : vrai sauf pour POST et PATCH. */
  readonly idempotente?: boolean;
};

export function definirOperation<P = void, R = unknown>(
  def: DefinitionOperation<P, R>,
): Operation<P, R> {
  return {
    ...def,
    idempotente: def.idempotente ?? (def.methode !== "POST" && def.methode !== "PATCH"),
  };
}

/** Canal temps réel (WebSocket côté HTTP, flux scripté côté mock). `P` = paramètres, `M` = message. */
export interface Canal<P = void, M = unknown> {
  readonly nom: string;
  /** Chemin WebSocket relatif à la base de l'API, par exemple `/departs/abc/direct`. */
  readonly chemin: (params: P) => string;
  readonly message: z.ZodType<M>;
}

export function definirCanal<P = void, M = unknown>(def: Canal<P, M>): Canal<P, M> {
  return def;
}

export function validerAvec<T>(schema: z.ZodType<T>, brut: unknown, nom: string): T {
  const resultat = schema.safeParse(brut);
  if (!resultat.success) throw new ErreurValidation(nom, resultat.error.issues);
  return resultat.data;
}
