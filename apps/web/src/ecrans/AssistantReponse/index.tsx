import { patron } from "@afrimove/api-client";
import { useModeDemo } from "@/coquille/parametres";
import { GRAPHIQUE_DEMO } from "./graphique";
import { ReponseVue, type EtatReponse } from "./reponse-vue";

/**
 * Écran « L'assistant répond » (AM-105, planche AssistantReponse.dc.html) : la conversation du patron avec l'assistant,
 * question par question, sur ses chiffres des 30 derniers jours.
 *
 * Tout vient de `useConversationAssistant` (le texte est écrit par l'API, qui n'y met que des données de la compagnie
 * ou des données anonymes et agrégées du réseau, et cite ses sources) et est affiché tel quel. Aucune action ne
 * modifie un réglage : chacune ouvre l'écran concerné. Seule écriture : poser une autre question (`usePoserQuestion`,
 * sans PIN, qui ne change rien) ; la réponse s'ajoute en bas de la conversation.
 *
 * Les lignes du réseau (`useAnalyses`) servent à ouvrir celle dont la réponse parle. Le graphique du diagnostic n'est
 * pas dans le contrat : il n'est dessiné que dans la démonstration (voir `graphique.ts`).
 */
export function EcranAssistantReponse() {
  const conversation = patron.useConversationAssistant();
  const analyses = patron.useAnalyses();
  const poser = patron.usePoserQuestion();
  const demo = useModeDemo();

  const { mutateAsync } = poser;
  async function poserQuestion(question: string): Promise<boolean> {
    if (poser.isPending) return false;
    try {
      await mutateAsync({ question });
      return true;
    } catch {
      return false;
    }
  }

  return (
    <ReponseVue
      etat={etatDe(conversation)}
      conversation={conversation.data}
      lignes={analyses.data?.lignes}
      graphique={demo ? GRAPHIQUE_DEMO : undefined}
      enAttente={poser.isPending ? poser.variables.question : null}
      erreurEnvoi={poser.isError}
      onPoser={poserQuestion}
      onReessayer={() => void conversation.refetch()}
    />
  );
}

function etatDe(requete: {
  data: { echanges: readonly unknown[] } | undefined;
  isError: boolean;
  isPending: boolean;
}): EtatReponse {
  if (requete.data) return requete.data.echanges.length === 0 ? "vide" : "pret";
  if (requete.isError) return "erreur";
  if (requete.isPending) return "chargement";
  return "vide";
}

export default EcranAssistantReponse;
