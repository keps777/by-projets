import { useEffect } from "react";
import { useSession } from "@/coquille/session";
import { jetonExpire, oublierJeton } from "./stockage";

/** Contrôle de l'échéance du jeton : toutes les 30 s, et tout de suite au démarrage. */
export const INTERVALLE_SESSION_MS = 30_000;

interface Props {
  /** Vrai avec l'API réelle (mode http). */
  actif: boolean;
  intervalleMs?: number;
  /** Horloge (ms), imposée par les tests. */
  maintenant?: () => number;
}

/**
 * Le jeton de l'API n'a pas de renouvellement : passé son délai, l'API répond 401 à tout. Ce composant ferme alors
 * la session de l'application (la garde de rôle renvoie à la connexion) au lieu de laisser des écrans qui
 * échouent tous. Il ne rend rien.
 */
export function SurveillantSessionAgent({
  actif,
  intervalleMs = INTERVALLE_SESSION_MS,
  maintenant = Date.now,
}: Props) {
  const { fermerSession } = useSession();

  useEffect(() => {
    if (!actif) return;
    const verifier = () => {
      if (!jetonExpire(maintenant())) return;
      oublierJeton();
      fermerSession();
    };
    verifier();
    const minuterie = setInterval(verifier, intervalleMs);
    return () => clearInterval(minuterie);
  }, [actif, intervalleMs, maintenant, fermerSession]);

  return null;
}
