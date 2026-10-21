import { patron } from "@afrimove/api-client";
import { useState } from "react";
import { AnalysesVue } from "./analyses-vue";
import type { EtatBloc, Periode } from "./types";

/**
 * Écran Analyses (AM-106, planche Analyses.dc.html) : la semaine, les lignes, les bus.
 *
 * Les chiffres viennent de `useAnalyses(periode)` : changer la période est une autre lecture, donc tous les blocs
 * sont recalculés par l'API (et montrent leur chargement le temps qu'elle répond). `useTableauDuJour` (partagé avec
 * l'accueil du patron) ne sert qu'à lire le nombre de bus de la flotte, que la liste « Par bus » annonce. Aucune
 * écriture ici : chaque ligne ouvre son détail, les deux boutons du pied ouvrent Comptable et l'assistant.
 */
export function EcranAnalyses() {
  const [periode, setPeriode] = useState<Periode>("semaine");
  const analyses = patron.useAnalyses(periode);
  const tableau = patron.useTableauDuJour();

  return (
    <AnalysesVue
      periode={periode}
      onPeriode={setPeriode}
      etat={etatDe(analyses)}
      analyses={analyses.data}
      nbBus={tableau.data?.nbBus}
      onReessayer={() => void analyses.refetch()}
    />
  );
}

function etatDe(requete: { data: unknown; isError: boolean; isPending: boolean }): EtatBloc {
  if (requete.data) return "pret";
  if (requete.isError) return "erreur";
  if (requete.isPending) return "chargement";
  return "vide";
}

export default EcranAnalyses;
