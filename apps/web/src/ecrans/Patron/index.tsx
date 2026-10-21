import { patron, useClientApi } from "@afrimove/api-client";
import { useEffect, useMemo, useState } from "react";
import { AccueilVue, type EtatBloc } from "./accueil-vue";
import { DIRECT_VIDE, alertesAvecDirect, recevoir, tableauAvecDirect, type Direct } from "./direct";

/**
 * Écran Patron (AM-100, planche Patron.dc.html) : l'accueil du patron, tout à une touche.
 *
 * Les données viennent de `useTableauDuJour` (chiffres, en-tête, assistant), `useAlertes` (la liste) et
 * `useDirectJour` (temps réel : chiffres rafraîchis, nouvelle alerte) ; `useGares` ne sert qu'à retrouver la gare d'une
 * alerte d'écart de caisse. Aucune écriture ici : chaque alerte et chaque tuile ouvre l'écran qui permet d'agir.
 */
export function EcranPatron() {
  const tableau = patron.useTableauDuJour({ refetchOnMount: "always" });
  const alertes = patron.useAlertes({ refetchOnMount: "always" });
  const gares = patron.useGares();
  const direct = patron.useDirectJour();
  const horloge = useClientApi().horloge;
  const [recu, setRecu] = useState<Direct>(DIRECT_VIDE);

  // Chaque message est appliqué tout de suite ; une nouvelle alerte recharge aussi la liste, qui rattrape ce qu'une
  // rafale aurait fait sauter (`alertesAvecDirect` n'ajoute jamais deux fois la même alerte).
  const { refetch: rechargerAlertes } = alertes;
  useEffect(() => {
    const message = direct.dernier;
    if (!message) return;
    setRecu((avant) => recevoir(avant, message));
    if (message.type === "alerte") void rechargerAlertes();
  }, [direct.dernier, rechargerAlertes]);

  const lecture = tableau.data;
  const donnees = useMemo(
    () => (lecture ? tableauAvecDirect(lecture, recu) : undefined),
    [lecture, recu],
  );
  const liste = useMemo(
    () => (alertes.data ? alertesAvecDirect(alertes.data.alertes, recu) : undefined),
    [alertes.data, recu],
  );
  const garesConnues = useMemo(
    () => gares.data?.gares.map((g) => ({ id: g.id, nom: g.nom })),
    [gares.data],
  );

  return (
    <AccueilVue
      etat={etatDe(donnees, tableau)}
      tableau={donnees}
      etatAlertes={etatDe(liste, alertes)}
      alertes={liste}
      gares={garesConnues}
      instant={donnees?.instant ?? horloge.iso()}
      onReessayer={() => void tableau.refetch()}
      onReessayerAlertes={() => void alertes.refetch()}
    />
  );
}

function etatDe(donnees: unknown, requete: { isError: boolean; isPending: boolean }): EtatBloc {
  if (donnees) return "pret";
  if (requete.isError) return "erreur";
  if (requete.isPending) return "chargement";
  return "vide";
}

export default EcranPatron;
