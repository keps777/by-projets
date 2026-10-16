import type { ErreurApi } from "./erreurs";
import type { Horloge } from "./horloge";
import type { Canal, Operation } from "./operations";

export interface OptionsExecution {
  signal?: AbortSignal;
}

export type EtatFlux = "connexion" | "ouvert" | "reconnexion" | "ferme";

export interface OptionsFlux {
  surErreur?: (erreur: ErreurApi) => void;
  surEtat?: (etat: EtatFlux) => void;
}

export type Desabonnement = () => void;

/**
 * L'unique interface que voient les écrans. Les deux adaptateurs (mock, HTTP) la respectent :
 * passer de l'un à l'autre ne change aucune ligne d'écran.
 */
export interface ClientApi {
  readonly mode: "mock" | "http";
  readonly horloge: Horloge;
  /** Exécute une opération ; la réponse est toujours validée par son schéma zod. */
  executer<P, R>(operation: Operation<P, R>, params: P, options?: OptionsExecution): Promise<R>;
  /** Écoute un canal temps réel ; renvoie la fonction de désabonnement. */
  souscrire<P, M>(
    canal: Canal<P, M>,
    params: P,
    ecouteur: (message: M) => void,
    options?: OptionsFlux,
  ): Desabonnement;
}
