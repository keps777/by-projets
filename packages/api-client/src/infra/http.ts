import type { ClientApi, Desabonnement, EtatFlux, OptionsExecution, OptionsFlux } from "./client";
import {
  ErreurAnnulee,
  ErreurApi,
  ErreurConfiguration,
  ErreurDelai,
  ErreurHttp,
  ErreurReseau,
  ErreurValidation,
  estErreurApi,
} from "./erreurs";
import { horlogeSysteme } from "./horloge";
import type { Horloge } from "./horloge";
import { validerAvec } from "./operations";
import type { Canal, Operation } from "./operations";

/** Le strict nécessaire d'une WebSocket, pour pouvoir la remplacer dans les tests. */
export interface SocketLike {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(): void;
}

export interface OptionsRelance {
  /** Nombre maximal de relances (pas de tentatives). Défaut 2. */
  max?: number;
  /** Délai avant la première relance, doublé à chaque fois. Défaut 300 ms. */
  delaiMs?: number;
  /** Plafond du délai. Défaut 4 000 ms. */
  delaiMaxMs?: number;
}

export interface OptionsHttp {
  /** Racine de l'API : `/api` (même origine) ou `https://api.exemple.cm`. */
  urlBase: string;
  fetch?: typeof globalThis.fetch;
  horloge?: Horloge;
  alea?: () => number;
  /** Délai maximal d'une tentative. Défaut 15 000 ms. */
  delaiMs?: number;
  relance?: OptionsRelance;
  /** Jeton d'accès ajouté en `Authorization: Bearer`. */
  obtenirJeton?: () => string | null | undefined | Promise<string | null | undefined>;
  creerWebSocket?: (url: string) => SocketLike;
  /** Racine WebSocket ; sinon déduite de `urlBase`. */
  urlWebSocket?: string;
  /** Reconnexions du temps réel avant d'abandonner. Défaut 5. */
  reconnexionsMax?: number;
}

export interface ClientHttp extends ClientApi {
  readonly mode: "http";
}

function joindre(base: string, chemin: string): string {
  return `${base.replace(/\/+$/, "")}/${chemin.replace(/^\/+/, "")}`;
}

function chaineRequete(
  requete: Readonly<Record<string, string | number | boolean | undefined>> | undefined,
): string {
  if (!requete) return "";
  const p = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(requete)) {
    if (valeur !== undefined) p.set(cle, String(valeur));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function urlWebSocketDepuis(base: string, chemin: string, explicite?: string): string {
  const racine = explicite ?? base;
  if (/^wss?:\/\//.test(racine)) return joindre(racine, chemin);
  if (/^https?:\/\//.test(racine)) return joindre(racine.replace(/^http/, "ws"), chemin);
  const loc = (globalThis as { location?: { protocol: string; host: string } }).location;
  if (!loc) {
    throw new ErreurConfiguration("urlBase relative : impossible de déduire l'adresse WebSocket");
  }
  const schema = loc.protocol === "https:" ? "wss:" : "ws:";
  return joindre(`${schema}//${loc.host}${racine.startsWith("/") ? "" : "/"}${racine}`, chemin);
}

function lireDelaiReessai(entete: string | null): number | undefined {
  if (!entete) return undefined;
  const secondes = Number(entete);
  if (Number.isFinite(secondes)) return Math.max(0, secondes * 1000);
  const date = Date.parse(entete);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export function creerClientHttp(options: OptionsHttp): ClientHttp {
  const horloge = options.horloge ?? horlogeSysteme();
  const alea = options.alea ?? Math.random;
  const delaiMs = options.delaiMs ?? 15_000;
  const relanceMax = options.relance?.max ?? 2;
  const relanceBase = options.relance?.delaiMs ?? 300;
  const relancePlafond = options.relance?.delaiMaxMs ?? 4_000;
  const reconnexionsMax = options.reconnexionsMax ?? 5;
  const appelerFetch = (...args: Parameters<typeof fetch>): Promise<Response> =>
    (options.fetch ?? globalThis.fetch)(...args);

  async function tenter(
    operation: Operation<never, unknown>,
    params: never,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const url =
      joindre(options.urlBase, operation.chemin(params)) +
      chaineRequete(operation.requete?.(params));
    const corps = operation.corps?.(params);
    const entetes: Record<string, string> = { Accept: "application/json" };
    if (corps !== undefined) entetes["Content-Type"] = "application/json";
    const jeton = await options.obtenirJeton?.();
    if (jeton) entetes["Authorization"] = `Bearer ${jeton}`;
    if (signal?.aborted) throw new ErreurAnnulee();

    const controleur = new AbortController();
    let expire = false;
    const annulerDelai = horloge.planifier(delaiMs, () => {
      expire = true;
      controleur.abort();
    });
    const surAbandon = (): void => controleur.abort();
    if (signal?.aborted) controleur.abort();
    signal?.addEventListener("abort", surAbandon, { once: true });

    try {
      let reponse: Response;
      try {
        reponse = await appelerFetch(url, {
          method: operation.methode,
          headers: entetes,
          body: corps === undefined ? undefined : JSON.stringify(corps),
          signal: controleur.signal,
        });
      } catch (e) {
        if (expire) throw new ErreurDelai(delaiMs);
        if (signal?.aborted) throw new ErreurAnnulee();
        throw new ErreurReseau(undefined, e);
      }

      const texte = await reponse.text().catch(() => "");
      if (!reponse.ok) {
        let code: string | undefined;
        let message = `HTTP ${reponse.status}`;
        let details: unknown;
        try {
          const json = JSON.parse(texte) as {
            code?: unknown;
            message?: unknown;
            details?: unknown;
          };
          if (typeof json.code === "string") code = json.code;
          if (typeof json.message === "string") message = json.message;
          details = json.details;
        } catch {
          // Corps non JSON : on garde le message par défaut.
        }
        throw new ErreurHttp(
          reponse.status,
          message,
          code,
          details,
          lireDelaiReessai(reponse.headers.get("Retry-After")),
        );
      }
      if (texte === "") return undefined;
      try {
        return JSON.parse(texte) as unknown;
      } catch {
        throw new ErreurValidation(operation.nom, [], `Réponse non JSON pour « ${operation.nom} »`);
      }
    } finally {
      annulerDelai();
      signal?.removeEventListener("abort", surAbandon);
    }
  }

  function delaiRelance(tentative: number, erreur: ErreurApi): number {
    if (erreur instanceof ErreurHttp && erreur.reessayerApresMs !== undefined) {
      return Math.min(erreur.reessayerApresMs, relancePlafond);
    }
    const exponentiel = Math.min(relanceBase * 2 ** (tentative - 1), relancePlafond);
    // Gigue de ±20 % pour ne pas relancer tous les téléphones au même instant.
    return Math.round(exponentiel * (0.8 + 0.4 * alea()));
  }

  return {
    mode: "http",
    horloge,

    async executer<P, R>(
      operation: Operation<P, R>,
      params: P,
      opts?: OptionsExecution,
    ): Promise<R> {
      for (let tentative = 0; ; tentative++) {
        try {
          const brut = await tenter(
            operation as unknown as Operation<never, unknown>,
            params as never,
            opts?.signal,
          );
          return validerAvec(operation.reponse, brut, operation.nom);
        } catch (e) {
          const erreur = estErreurApi(e) ? e : new ErreurReseau(undefined, e);
          if (!erreur.retentable || !operation.idempotente || tentative >= relanceMax) throw erreur;
          await horloge.attendre(delaiRelance(tentative + 1, erreur), opts?.signal);
        }
      }
    },

    souscrire<P, M>(
      canal: Canal<P, M>,
      params: P,
      ecouteur: (message: M) => void,
      opts?: OptionsFlux,
    ): Desabonnement {
      let actif = true;
      let tentatives = 0;
      let socket: SocketLike | undefined;
      let annulerReconnexion: (() => void) | undefined;

      const etat = (e: EtatFlux): void => opts?.surEtat?.(e);
      const echouer = (e: ErreurApi): void => opts?.surErreur?.(e);

      const ouvrir = (): void => {
        let url: string;
        try {
          url = urlWebSocketDepuis(options.urlBase, canal.chemin(params), options.urlWebSocket);
        } catch (e) {
          echouer(estErreurApi(e) ? e : new ErreurReseau(undefined, e));
          etat("ferme");
          return;
        }
        const creer =
          options.creerWebSocket ??
          ((u: string): SocketLike => new WebSocket(u) as unknown as SocketLike);
        const s = creer(url);
        socket = s;
        s.onopen = () => {
          tentatives = 0;
          etat("ouvert");
        };
        s.onmessage = (ev) => {
          if (!actif) return;
          try {
            const brut: unknown = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
            ecouteur(validerAvec(canal.message, brut, canal.nom));
          } catch (e) {
            echouer(
              estErreurApi(e)
                ? e
                : new ErreurValidation(canal.nom, [], `Message illisible sur « ${canal.nom} »`),
            );
          }
        };
        s.onerror = () => {
          // La fermeture qui suit déclenche la reconnexion.
        };
        s.onclose = () => {
          if (!actif) return;
          socket = undefined;
          if (tentatives >= reconnexionsMax) {
            echouer(new ErreurReseau(`Flux « ${canal.nom} » interrompu`));
            etat("ferme");
            return;
          }
          tentatives++;
          etat("reconnexion");
          const attente = Math.min(relanceBase * 2 ** (tentatives - 1), relancePlafond);
          annulerReconnexion = horloge.planifier(attente, () => {
            annulerReconnexion = undefined;
            if (actif) ouvrir();
          });
        };
      };

      etat("connexion");
      ouvrir();

      return () => {
        if (!actif) return;
        actif = false;
        annulerReconnexion?.();
        const s = socket;
        socket = undefined;
        if (s) {
          s.onclose = null;
          s.onmessage = null;
          s.close();
        }
        etat("ferme");
      };
    },
  };
}
