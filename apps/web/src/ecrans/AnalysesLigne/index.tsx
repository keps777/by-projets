import { ErreurHttp, patron } from "@afrimove/api-client";
import { useState } from "react";
import { useParams } from "react-router";
import { AnalyseLigneVue } from "./ligne-vue";
import type { EtatLigne, Periode } from "./types";

/**
 * Écran Analyse d'une ligne (AM-107, planche AnalysesLigne.dc.html) : une ligne du réseau vue par le patron.
 *
 * Tout vient de `useAnalyseLigne(ligneId, periode)` : changer la période est une autre lecture, donc tous les blocs
 * sont relus (et montrent leur chargement le temps que l'API répond). Aucune écriture ici : chaque départ ouvre le
 * réglage de la ligne, les deux boutons du pied ouvrent l'assistant et le réglage.
 */
export function EcranAnalysesLigne() {
  const { ligneId = "" } = useParams();
  const [periode, setPeriode] = useState<Periode>("semaine");
  const analyse = patron.useAnalyseLigne(ligneId, periode);
  return (
    <AnalyseLigneVue
      ligneId={ligneId}
      periode={periode}
      onPeriode={setPeriode}
      etat={etatDe(analyse)}
      analyse={analyse.data}
      onReessayer={() => void analyse.refetch()}
    />
  );
}

/**
 * « Ligne inconnue » (404) n'est pas une panne : réessayer ne la fera pas apparaître. Le 404 « période indisponible »
 * (contrat : `PERIODE_INDISPONIBLE`) ne dit rien de la ligne : l'écran le traite comme une lecture qui a échoué.
 */
function introuvable(erreur: unknown): boolean {
  return (
    erreur instanceof ErreurHttp && erreur.statut === 404 && erreur.code !== "PERIODE_INDISPONIBLE"
  );
}

function etatDe(requete: {
  data: unknown;
  error: unknown;
  isError: boolean;
  isPending: boolean;
}): EtatLigne {
  if (requete.data) return "pret";
  if (requete.isError) return introuvable(requete.error) ? "introuvable" : "erreur";
  if (requete.isPending) return "chargement";
  return "introuvable";
}

export default EcranAnalysesLigne;
