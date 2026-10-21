import { ErreurHttp, agence } from "@afrimove/api-client";
import { Debloquer } from "./Debloquer";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";

/**
 * Planche « SuperviseurDebloquer » (AM-094) : le superviseur débloque un téléphone de guichet hors ligne depuis plus
 * de 12 h.
 *
 * Lit l'appareil par `useSuperviseurAppareil(appareilId)` ; écrit par `useDebloquerAppareil` (avec le PIN, dans la
 * feuille de `Debloquer`). `networkMode: "always"` : la lecture est locale, elle se recharge aussi hors ligne (AM-160).
 *
 * Le moteur hors ligne (`@afrimove/sync`) n'est pas appelé d'ici : l'octroi est posé côté serveur par
 * `appareil.debloque` (apps/api/src/sync) et l'appareil le lit à sa prochaine synchronisation.
 */
export function EcranSuperviseurDebloquer({ appareilId }: { appareilId: string | undefined }) {
  const requete = agence.useSuperviseurAppareil(appareilId ?? "", {
    enabled: appareilId !== undefined && appareilId !== "",
    networkMode: "always",
  });

  if (appareilId === undefined || appareilId === "") return <EtatVide />;
  if (requete.isPending) return <EtatChargement />;
  if (requete.isError) {
    const erreur = requete.error;
    return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
      <EtatVide />
    ) : (
      <EtatErreur onReessayer={() => void requete.refetch()} />
    );
  }
  return <Debloquer appareil={requete.data} />;
}
