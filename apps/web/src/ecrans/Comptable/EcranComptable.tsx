import { patron } from "@afrimove/api-client";
import { useEffect, useState } from "react";
import { ComptableVue, type EtatEcran, type MoisDisponible } from "./comptable-vue";

/**
 * Écran Comptable (AM-110, planche Comptable.dc.html) : le mois, le rapprochement MoMo, les cinq exports et l'envoi
 * au cabinet.
 *
 * Tout vient de `useSyntheseComptable` ; le sélecteur de mois la relit pour le mois choisi. Aucune écriture ici : le
 * rapprochement se traite sur ComptableRapprochement, la clôture sur ComptableCloture, chaque export s'ouvre sur
 * ComptableApercu.
 */
export function EcranComptable() {
  const [choisi, setChoisi] = useState<string | undefined>(undefined);
  const synthese = patron.useSyntheseComptable(choisi);
  const donnees = synthese.data;

  // Les mois proposés viennent de la synthèse ; on les garde pendant qu'un autre mois se charge ou échoue, pour que le
  // sélecteur reste là et permette de revenir.
  const [memoire, setMemoire] = useState<readonly MoisDisponible[]>([]);
  const moisDeLaSynthese = donnees?.moisDisponibles;
  useEffect(() => {
    if (moisDeLaSynthese) setMemoire(moisDeLaSynthese);
  }, [moisDeLaSynthese]);

  const moisDisponibles = moisDeLaSynthese ?? memoire;
  const mois = choisi ?? donnees?.mois ?? moisDisponibles[0]?.mois ?? "";

  const etat: EtatEcran = donnees
    ? "pret"
    : synthese.isError
      ? "erreur"
      : synthese.isPending
        ? "chargement"
        : "vide";

  return (
    <ComptableVue
      etat={etat}
      synthese={donnees}
      moisDisponibles={moisDisponibles}
      mois={mois}
      onMois={setChoisi}
      onReessayer={() => void synthese.refetch()}
    />
  );
}

export default EcranComptable;
