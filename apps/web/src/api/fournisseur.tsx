import {
  FournisseurApi,
  creerClientDepuisEnvironnement,
  lireConfig,
  type ClientApi,
} from "@afrimove/api-client";
import { useEffect, useState, type ReactNode } from "react";

interface Props {
  /** Client imposé (tests). Sinon créé d'après `VITE_API_MODE` et les paramètres d'URL. */
  client?: ClientApi;
  children?: ReactNode;
}

/** Mode « http » si le serveur est configuré ; sinon « mock », dont les fixtures sont chargées à la demande. */
async function creerClientApplication(): Promise<ClientApi> {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const config = lireConfig(env, window.location.search);
  if (config.mode === "http") return creerClientDepuisEnvironnement();
  const { sourceScenariosFixtures } = await import("./source-scenarios");
  return creerClientDepuisEnvironnement({ source: sourceScenariosFixtures() });
}

/** Fournit le client d'API à tous les écrans (hooks `useRequete`, `useMutationApi`, `useFlux`). */
export function FournisseurApiApplication({ client, children }: Props) {
  const [cree, setCree] = useState<ClientApi | undefined>(client);

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

  const courant = client ?? cree;
  if (!courant) return null;
  return <FournisseurApi client={courant}>{children}</FournisseurApi>;
}
