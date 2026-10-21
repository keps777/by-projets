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
  /**
   * Comment lire la réponse HTTP : `json` (par défaut), ou `binaire` pour un fichier remis tel quel (octets,
   * nom tiré de `Content-Disposition`, type et empreinte). L'objet reçu est alors validé par `reponse`.
   */
  readonly lecture?: "json" | "binaire";
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

/** Le fichier tel que l'adaptateur HTTP le remet à `reponse` quand `lecture` vaut `binaire`. */
export interface FichierRecu {
  nom: string;
  typeMime: string;
  empreinte: string | null;
  octets: Uint8Array;
}

/** Le nom de fichier d'un en-tête `Content-Disposition` (« attachment; filename="journal.xlsx" »), ou `null`. */
export function nomDansContentDisposition(entete: string | null): string | null {
  if (!entete) return null;
  const etoile = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(entete)?.[1];
  if (etoile) {
    try {
      return decodeURIComponent(etoile.trim());
    } catch {
      // Encodage illisible : on tente le nom simple.
    }
  }
  const simple = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/.exec(entete);
  const nom = simple?.[1]?.replace(/\\(.)/g, "$1") ?? simple?.[2]?.trim();
  return nom && nom.length > 0 ? nom : null;
}

export function validerAvec<T>(schema: z.ZodType<T>, brut: unknown, nom: string): T {
  const resultat = schema.safeParse(brut);
  if (!resultat.success) throw new ErreurValidation(nom, resultat.error.issues);
  return resultat.data;
}
