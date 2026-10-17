import { patron } from "@afrimove/api-client";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { AssistantVue, type EtatAssistant } from "./assistant-vue";

/**
 * Écran Assistant (AM-104, planche Assistant.dc.html) : l'assistant du patron, « Argent qui fuit » et « Argent à
 * gagner ».
 *
 * Les constats et simulations viennent de `useInsightsAssistant` (le texte est écrit par l'API, qui n'y met que des
 * données de la compagnie ou des données anonymes et agrégées du réseau) et sont affichés tels quels. Aucune action ne
 * modifie un réglage : chacune ouvre l'écran de réglage concerné. Seule écriture : poser une question (saisie ou question
 * suggérée), qui ne change rien (`usePoserQuestion`, sans PIN) ; la réponse s'ouvre ensuite dans AssistantReponse.
 */
export function EcranAssistant() {
  const insights = patron.useInsightsAssistant();
  const poser = patron.usePoserQuestion();
  const naviguer = useNavigate();

  const { mutate } = poser;
  function poserQuestion(question: string) {
    if (poser.isPending) return;
    mutate({ question }, { onSuccess: () => void naviguer(urlPlanche("AssistantReponse")) });
  }

  return (
    <AssistantVue
      etat={etatDe(insights)}
      insights={insights.data}
      onPoser={poserQuestion}
      erreurEnvoi={poser.isError}
      onReessayer={() => void insights.refetch()}
    />
  );
}

function etatDe(requete: {
  data: { fuites: readonly unknown[]; gains: readonly unknown[] } | undefined;
  isError: boolean;
  isPending: boolean;
}): EtatAssistant {
  if (requete.data) {
    return requete.data.fuites.length === 0 && requete.data.gains.length === 0 ? "vide" : "pret";
  }
  if (requete.isError) return "erreur";
  if (requete.isPending) return "chargement";
  return "vide";
}

export default EcranAssistant;
