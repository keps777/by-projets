import {
  FournisseurApi,
  creerClientDepuisEnvironnement,
  lireConfig,
  type ClientApi,
} from "@afrimove/api-client";
import type { MoteurSync } from "@afrimove/sync";
import { QueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { FournisseurHorsLigne, ouvrirHorsLigne } from "@/hors-ligne";

interface Props {
  /** Client imposé (tests). Sinon créé d'après `VITE_API_MODE` et les paramètres d'URL. */
  client?: ClientApi;
  children?: ReactNode;
}

interface Application {
  client: ClientApi;
  /** Le moteur hors ligne de l'appareil : mode HTTP seulement, et seulement si l'appareil est installé. */
  moteur: MoteurSync | null;
  queryClient?: QueryClient;
}

/**
 * Avec le moteur hors ligne, les lectures et les ventes ne doivent pas se suspendre quand le navigateur se dit hors
 * ligne (le mode par défaut de TanStack Query les met en pause) : le client décide lui-même, avec ce qu'il a gardé.
 */
function queryClientHorsLigne(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        networkMode: "always",
      },
      mutations: { networkMode: "always" },
    },
  });
}

/** Mode « http » si le serveur est configuré ; sinon « mock », dont les fixtures sont chargées à la demande. */
async function creerClientApplication(): Promise<Application> {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const config = lireConfig(env, window.location.search);
  if (config.mode === "http") {
    const base = creerClientDepuisEnvironnement();
    const horsLigne = await ouvrirHorsLigne(base, { urlBase: config.urlBase });
    return horsLigne
      ? { client: horsLigne.client, moteur: horsLigne.moteur, queryClient: queryClientHorsLigne() }
      : { client: base, moteur: null };
  }
  const { sourceScenariosFixtures } = await import("./source-scenarios");
  return {
    client: creerClientDepuisEnvironnement({ source: sourceScenariosFixtures() }),
    moteur: null,
  };
}

/** Fournit le client d'API à tous les écrans (hooks `useRequete`, `useMutationApi`, `useFlux`). */
export function FournisseurApiApplication({ client, children }: Props) {
  const [cree, setCree] = useState<Application | undefined>(undefined);

  useEffect(() => {
    if (client) return;
    let actif = true;
    void creerClientApplication().then((c) => {
      if (actif) setCree(c);
    });
    return () => {
      actif = false;
    };
  }, [client]);

  const courant = client ?? cree?.client;
  if (!courant) return null;
  const moteur = client ? null : (cree?.moteur ?? null);
  return (
    <FournisseurApi
      client={courant}
      {...(!client && cree?.queryClient ? { queryClient: cree.queryClient } : {})}
    >
      {moteur ? <FournisseurHorsLigne moteur={moteur}>{children}</FournisseurHorsLigne> : children}
    </FournisseurApi>
  );
}
