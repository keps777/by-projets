import { ErreurHttp, agence } from "@afrimove/api-client";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { ValiderCloture } from "./ValiderCloture";

/**
 * Planche « SuperviseurValider » (AM-091) : le superviseur valide ou refuse la clôture d'un guichet avec son PIN.
 *
 * Lit la clôture par `useSuperviseurCloture(sessionId)` ; écrit par `useValiderCloture` et `useRefuserCloture`.
 * `networkMode: "always"` : la lecture est locale, elle se recharge aussi hors ligne (AM-160).
 */
export function EcranSuperviseurValider({ sessionId }: { sessionId: string | undefined }) {
  const requete = agence.useSuperviseurCloture(sessionId ?? "", {
    enabled: sessionId !== undefined && sessionId !== "",
    networkMode: "always",
  });

  if (sessionId === undefined || sessionId === "") return <EtatVide />;
  if (requete.isPending) return <EtatChargement />;
  if (requete.isError) {
    const erreur = requete.error;
    return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
      <EtatVide />
    ) : (
      <EtatErreur onReessayer={() => void requete.refetch()} />
    );
  }
  return <ValiderCloture cloture={requete.data} />;
}
