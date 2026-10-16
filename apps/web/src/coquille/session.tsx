import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { estEspace, type Role } from "./roles";
import { CLES, ecrire, lire, retirer } from "./stockage";

/**
 * Session mock : un rôle et rien d'autre. La vraie connexion (numéro + code SMS) arrive avec AM-021 et
 * l'authentification avec AM-017 ; ce module garde la même forme pour que la garde de rôle ne change pas.
 */
export interface Session {
  role: Role;
}

export interface ContexteSession {
  /** `null` : personne n'est connecté (un voyageur sans compte). */
  session: Session | null;
  /** Rôle effectif : celui de la session, sinon voyageur. */
  role: Role;
  ouvrirSession: (role: Role) => void;
  fermerSession: () => void;
}

const SessionContexte = createContext<ContexteSession>({
  session: null,
  role: "voyageur",
  ouvrirSession: () => undefined,
  fermerSession: () => undefined,
});

export function lireSessionStockee(): Session | null {
  const brut = lire(CLES.session);
  if (!brut) return null;
  try {
    const valeur: unknown = JSON.parse(brut);
    const role =
      typeof valeur === "object" && valeur !== null ? (valeur as { role?: unknown }).role : null;
    return estEspace(role) ? { role } : null;
  } catch {
    return null;
  }
}

/**
 * `initiale` impose la session de départ (tests) ; sans elle on reprend celle du localStorage.
 */
export function SessionProvider({
  initiale,
  children,
}: {
  initiale?: Session | null;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(() =>
    initiale === undefined ? lireSessionStockee() : initiale,
  );

  const ouvrirSession = useCallback((role: Role) => {
    setSession({ role });
    ecrire(CLES.session, JSON.stringify({ role }));
  }, []);

  const fermerSession = useCallback(() => {
    setSession(null);
    retirer(CLES.session);
  }, []);

  const valeur = useMemo<ContexteSession>(
    () => ({
      session,
      role: session?.role ?? "voyageur",
      ouvrirSession,
      fermerSession,
    }),
    [session, ouvrirSession, fermerSession],
  );

  return <SessionContexte.Provider value={valeur}>{children}</SessionContexte.Provider>;
}

export function useSession(): ContexteSession {
  return useContext(SessionContexte);
}
