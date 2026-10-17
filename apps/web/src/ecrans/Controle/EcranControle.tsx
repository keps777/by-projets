import { patron } from "@afrimove/api-client";
import { useEffect, useMemo, useState } from "react";
import { moduleDeLUrl, useModules } from "@/coquille/modules";
import { DIRECT_VIDE, recevoir, salleAvecDirect, type Direct } from "./direct";
import { VueControle, type EtatEcran } from "./vue";

/**
 * Écran Salle de contrôle (AM-150, planche Controle.dc.html) : le direct des gares de la compagnie, sur ordinateur.
 *
 * Les données viennent de `useSalleDeControle` (la lecture complète) et de `useDirectControle` (temps réel : chiffres,
 * gares, éléments « à traiter »). Aucune écriture ici : chaque ligne ouvre l'écran qui permet d'agir.
 */
export function EcranControle() {
  const salle = patron.useSalleDeControle();
  const direct = patron.useDirectControle();
  const { moduleActif } = useModules();
  const [recu, setRecu] = useState<Direct>(DIRECT_VIDE);

  // Chaque message est appliqué tout de suite ; un nouvel élément « à traiter » relit aussi la salle, qui rattrape ce
  // qu'une rafale aurait fait sauter (`salleAvecDirect` n'ajoute jamais deux fois le même élément).
  const { refetch } = salle;
  useEffect(() => {
    const message = direct.dernier;
    if (!message) return;
    setRecu((avant) => recevoir(avant, message));
    if (message.type === "a_traiter") void refetch();
  }, [direct.dernier, refetch]);

  const lecture = salle.data;
  const donnees = useMemo(
    () => (lecture ? salleAvecDirect(lecture, recu) : undefined),
    [lecture, recu],
  );
  const etat: EtatEcran = donnees ? "pret" : salle.isError ? "erreur" : "chargement";

  return (
    <VueControle
      etat={etat}
      salle={donnees}
      enDirect={
        direct.etat === "ouvert" ||
        direct.etat === "connexion" ||
        (direct.etat === "ferme" && !direct.erreur)
      }
      lienActif={(href) => {
        const module = moduleDeLUrl(href);
        return module === null || moduleActif(module);
      }}
      onDirect={() => void refetch()}
      onReessayer={() => void refetch()}
    />
  );
}

export default EcranControle;
