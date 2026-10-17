import { patron } from "@afrimove/api-client";
import { BusVue } from "./bus-vue";
import { etatDe } from "./etat";

/**
 * Écran Analyse d'un bus (AM-108, planche AnalysesBus.dc.html) : le bus que le patron a ouvert depuis « Par bus · net »
 * d'Analyses.
 *
 * Tout vient de `useAnalyseBus(busId)` (`GET /patron/analyses/bus/:busId`) : recette, dépenses (les justificatifs saisis
 * par le chauffeur, AM-083), net sur huit semaines, trajets et avis de l'assistant. Aucune écriture : « Retour » et
 * « Toute la flotte » ramènent à Analyses, « Demander à l'assistant » ouvre l'assistant.
 */
export function EcranAnalysesBus({ busId }: { busId: string | undefined }) {
  const bus = patron.useAnalyseBus(busId ?? "");
  return <BusVue etat={etatDe(bus)} bus={bus.data} onReessayer={() => void bus.refetch()} />;
}

export default EcranAnalysesBus;
