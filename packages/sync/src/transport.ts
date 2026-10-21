import type { CleJwk } from "./signature";
import { SchemaReponseLot } from "./protocole";
import type { LotEvenements, ReponseLot } from "./protocole";

/**
 * Ce que le moteur demande au réseau. L'implémentation HTTP est `creerTransportHttp` ; les tests
 * et l'intégration avec l'API Nest en fournissent d'autres.
 */
export interface TransportSync {
  /** Envoie un lot (éventuellement vide : simple prise de nouvelles) et renvoie la réponse validée. */
  envoyer(lot: LotEvenements, options?: { signal?: AbortSignal }): Promise<ReponseLot>;
  /** Enregistre la clé publique de l'appareil (installation). */
  enroler?(appareilId: string, clePublique: CleJwk): Promise<void>;
}

export type NatureErreurTransport =
  /** Pas de réseau, serveur injoignable ou délai dépassé : on réessaiera. */
  | "reseau"
  /** 401 : le jeton a expiré, il faut se reconnecter (PIN) ; la file ne bouge pas. */
  | "authentification"
  /** 5xx, 429, réponse illisible : on réessaiera plus tard. */
  | "serveur"
  /** 4xx autre (appareil non enrôlé, signature refusée…) : une personne doit intervenir. */
  | "refus";

export class ErreurTransport extends Error {
  constructor(
    readonly nature: NatureErreurTransport,
    message: string,
    readonly statut?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ErreurTransport";
  }
}

export interface OptionsTransportHttp {
  /** Racine de l'API : `/api` (même origine) ou `https://api.exemple.cm`. */
  urlBase: string;
  fetch?: typeof globalThis.fetch;
  /** Jeton d'accès (`Authorization: Bearer`). Appelé à chaque envoi : il peut se renouveler. */
  obtenirJeton: () => string | null | undefined | Promise<string | null | undefined>;
  /** Délai maximal d'un envoi. Défaut 30 s (un lot de 50 événements sur une connexion partagée). */
  delaiMs?: number;
}

function joindre(base: string, chemin: string): string {
  return `${base.replace(/\/+$/, "")}/${chemin.replace(/^\/+/, "")}`;
}

export function creerTransportHttp(options: OptionsTransportHttp): TransportSync {
  const delaiMs = options.delaiMs ?? 30_000;
  const appeler = async (
    methode: "POST" | "PUT",
    chemin: string,
    corps: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> => {
    const jeton = await options.obtenirJeton();
    if (!jeton) throw new ErreurTransport("authentification", "Aucun jeton : connexion requise");
    const controleur = new AbortController();
    let expire = false;
    const minuterie = setTimeout(() => {
      expire = true;
      controleur.abort();
    }, delaiMs);
    const surAbandon = (): void => controleur.abort();
    signal?.addEventListener("abort", surAbandon, { once: true });
    let reponse: Response;
    try {
      reponse = await (options.fetch ?? globalThis.fetch)(joindre(options.urlBase, chemin), {
        method: methode,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${jeton}`,
        },
        body: JSON.stringify(corps),
        signal: controleur.signal,
      });
    } catch (e) {
      throw new ErreurTransport(
        "reseau",
        expire ? `Délai dépassé (${delaiMs} ms)` : e instanceof Error ? e.message : String(e),
      );
    } finally {
      clearTimeout(minuterie);
      signal?.removeEventListener("abort", surAbandon);
    }
    if (reponse.ok) {
      // `PUT /sync/appareils/:id/cle` répond 204, sans corps : ce n'est pas une réponse illisible (constat de la
      // recette contre la vraie API, AM-181).
      if (reponse.status === 204) return undefined;
      try {
        return await reponse.json();
      } catch {
        throw new ErreurTransport("serveur", "Réponse illisible", reponse.status);
      }
    }
    let code: string | undefined;
    let message = `Erreur HTTP ${reponse.status}`;
    try {
      const corpsErreur = (await reponse.json()) as { code?: unknown; message?: unknown };
      if (typeof corpsErreur.code === "string") code = corpsErreur.code;
      if (typeof corpsErreur.message === "string") message = corpsErreur.message;
    } catch {
      /* corps absent ou illisible : le statut suffit */
    }
    if (reponse.status === 401) throw new ErreurTransport("authentification", message, 401, code);
    if (reponse.status >= 500 || reponse.status === 429 || reponse.status === 408) {
      throw new ErreurTransport("serveur", message, reponse.status, code);
    }
    throw new ErreurTransport("refus", message, reponse.status, code);
  };

  return {
    async envoyer(lot, opts) {
      const brut = await appeler("POST", "/sync/evenements", lot, opts?.signal);
      const lu = SchemaReponseLot.safeParse(brut);
      if (!lu.success) throw new ErreurTransport("serveur", "Réponse du serveur invalide");
      return lu.data;
    },
    async enroler(appareilId, clePublique) {
      await appeler("PUT", `/sync/appareils/${encodeURIComponent(appareilId)}/cle`, {
        cle: clePublique,
      });
    },
  };
}
