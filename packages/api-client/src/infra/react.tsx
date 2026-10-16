import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import type {
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ClientApi, EtatFlux } from "./client";
import { ErreurApi } from "./erreurs";
import type { Canal, Operation } from "./operations";

const ContexteClient = createContext<ClientApi | null>(null);

/**
 * Cache TanStack Query pour le client d'API. Pas de relance ici : l'adaptateur HTTP relance déjà
 * (et seulement les opérations idempotentes).
 */
export function creerQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: false } },
  });
}

export interface PropsFournisseurApi {
  client: ClientApi;
  /** Par défaut : un cache neuf par client, pour ne jamais mélanger données mock et HTTP. */
  queryClient?: QueryClient;
  children?: ReactNode;
}

const identifiants = new WeakMap<ClientApi, number>();
let prochainIdentifiant = 0;
function identifiantDe(client: ClientApi): number {
  let id = identifiants.get(client);
  if (id === undefined) {
    id = prochainIdentifiant++;
    identifiants.set(client, id);
  }
  return id;
}

export function FournisseurApi({ client, queryClient, children }: PropsFournisseurApi) {
  const cache = useMemo(() => queryClient ?? creerQueryClient(), [client, queryClient]);
  return (
    // `key` : changer de client remonte les écrans (TanStack Query ne rebranche pas ses observateurs
    // sur un autre cache).
    <ContexteClient.Provider key={identifiantDe(client)} value={client}>
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    </ContexteClient.Provider>
  );
}

export function useClientApi(): ClientApi {
  const client = useContext(ContexteClient);
  if (!client) throw new Error("useClientApi : ce composant doit être dans un <FournisseurApi>");
  return client;
}

/** Clé de cache d'une opération : `[nom, params]`. */
export function cleRequete<P>(operation: Operation<P, unknown>, params: P): readonly unknown[] {
  return [operation.nom, params ?? null];
}

export type OptionsRequete<R> = Omit<
  UseQueryOptions<R, ErreurApi, R, readonly unknown[]>,
  "queryKey" | "queryFn"
>;

/** Lecture : `const { data, isPending, error } = useRequete(OP_DEPARTS, { gareId })`. */
export function useRequete<P, R>(
  operation: Operation<P, R>,
  params: P,
  options?: OptionsRequete<R>,
): UseQueryResult<R, ErreurApi> {
  const client = useClientApi();
  return useQuery<R, ErreurApi, R, readonly unknown[]>({
    ...options,
    queryKey: cleRequete(operation, params),
    queryFn: ({ signal }) => client.executer(operation, params, { signal }),
  });
}

/** Écriture : `const vendre = useMutationApi(OP_VENDRE); vendre.mutate({ ... })`. */
export function useMutationApi<P, R>(
  operation: Operation<P, R>,
  options?: Omit<UseMutationOptions<R, ErreurApi, P>, "mutationFn">,
): UseMutationResult<R, ErreurApi, P> {
  const client = useClientApi();
  return useMutation<R, ErreurApi, P>({
    ...options,
    mutationFn: (params) => client.executer(operation, params),
  });
}

export interface OptionsFluxReact {
  /** Faux pour suspendre l'écoute. Défaut vrai. */
  actif?: boolean;
}

export interface ResultatFlux<M> {
  dernier: M | undefined;
  etat: EtatFlux;
  erreur: ErreurApi | undefined;
}

/** Temps réel : le dernier message reçu, l'état de la connexion, la dernière erreur. */
export function useFlux<P, M>(
  canal: Canal<P, M>,
  params: P,
  options?: OptionsFluxReact,
): ResultatFlux<M> {
  const client = useClientApi();
  const actif = options?.actif ?? true;
  const [dernier, setDernier] = useState<M | undefined>(undefined);
  const [etat, setEtat] = useState<EtatFlux>("ferme");
  const [erreur, setErreur] = useState<ErreurApi | undefined>(undefined);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const cleParams = JSON.stringify(params ?? null);

  useEffect(() => {
    if (!actif) return;
    setErreur(undefined);
    return client.souscrire(canal, paramsRef.current, setDernier, {
      surEtat: setEtat,
      surErreur: setErreur,
    });
  }, [client, canal, cleParams, actif]);

  return { dernier, etat, erreur };
}
