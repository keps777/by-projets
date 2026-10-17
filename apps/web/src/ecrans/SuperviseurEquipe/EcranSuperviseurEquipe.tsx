import { agence } from "@afrimove/api-client";
import { EquipeVue } from "./EquipeVue";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";

/**
 * Planche « SuperviseurEquipe » (AM-093) : l'équipe de la gare, un compte et un PIN chacun.
 *
 * Lit l'équipe par `useSuperviseurEquipe` ; écrit par `useRenouvelerPin`, `useChangerAffectation`,
 * `useDesactiverCompte` et `useDebloquerPersonne` (voir EquipeVue). Chaque écriture porte la signature du PIN du
 * superviseur ; le PIN lui-même n'est jamais affiché ni gardé.
 * `networkMode: "always"` : la lecture est locale, elle se recharge aussi hors ligne (AM-160).
 */
export function EcranSuperviseurEquipe() {
  const requete = agence.useSuperviseurEquipe(
    {},
    { networkMode: "always", refetchOnMount: "always" },
  );

  // Une relecture en échec garde l'équipe déjà affichée.
  if (requete.data) {
    return requete.data.enService.length === 0 ? <EtatVide /> : <EquipeVue equipe={requete.data} />;
  }
  if (requete.isError) return <EtatErreur onReessayer={() => void requete.refetch()} />;
  return <EtatChargement />;
}

export default EcranSuperviseurEquipe;
