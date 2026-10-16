import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useModeDemo } from "./parametres";
import { ACCUEIL_ESPACE, peutOuvrir, type Espace } from "./roles";
import { useSession } from "./session";

/**
 * Garde de rôle d'un espace : un compte agent ne voit que son espace (`ESPACES_AUTORISES`).
 * - sans session, un espace d'agent renvoie vers /connexion ; l'espace voyageur reste ouvert à tous ;
 * - avec une session, sortir de son espace renvoie à l'accueil de son propre espace ;
 * - en mode démo la garde est ouverte (le sélecteur de rôle sert justement à passer d'un espace à l'autre).
 */
export function GardeRole({ espace, children }: { espace: Espace; children: ReactNode }) {
  const demo = useModeDemo();
  const { role, session } = useSession();
  if (demo || peutOuvrir(role, espace)) return <>{children}</>;
  if (!session) return <Navigate to="/connexion" replace />;
  return <Navigate to={ACCUEIL_ESPACE[role]} replace />;
}
