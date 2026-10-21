import { urlPlanche } from "@/coquille/planches";
import type { ActionAssistant, Echange, LigneReseau } from "./types";

/**
 * Écran qui s'ouvre quand le patron touche une action de l'assistant. Aucune action ne modifie quoi que ce soit ici :
 * elle ouvre l'écran concerné, où le patron décide (et signe par son PIN).
 *
 * - « Ajouter un départ mardi 17:00 » -> ConfigLigne (le réglage de la ligne) ;
 * - « Voir la ligne en détail » -> AnalysesLigne ;
 * - « Contrôle inopiné mardi » -> Controleur ; « Numéro obligatoire en cadence » et « Décaler le 10:00 à 09:15 dès
 *   lundi » -> Config (les propositions de l'assistant y sont déjà en ambre, à valider).
 *
 * `ligneId` est celle que l'action porte (contrat `ActionAssistant.ligneId`) ; à défaut, celle que l'écran a reconnue
 * dans le texte. Quand aucune ligne n'est connue, l'action ouvre la liste (Analyses) ou les réglages (Config) plutôt
 * qu'une ligne au hasard.
 */
export function destinationAction(type: ActionAssistant["type"], ligneId?: string): string {
  switch (type) {
    case "controle_inopine":
      return urlPlanche("Controleur");
    case "regle_cadence_numero":
    case "decaler_depart":
      return urlPlanche("Config");
    case "ajouter_depart":
      return ligneId ? urlPlanche("ConfigLigne", { ligneId }) : urlPlanche("Config");
    case "voir_ligne":
      return ligneId ? urlPlanche("AnalysesLigne", { ligneId }) : urlPlanche("Analyses");
  }
}

/** Minuscules, sans accents, ponctuation et flèches remplacées par une espace : « Douala → Bafoussam » -> « douala bafoussam ». */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * La ligne dont la réponse parle : celle dont le nom (« Douala → Bafoussam ») est écrit tel quel dans la question, le
 * résumé ou l'un des points. Deux lignes reconnues (ou aucune) : on ne choisit pas.
 */
export function ligneConcernee(
  echange: Pick<Echange, "question" | "resume" | "points">,
  lignes: readonly LigneReseau[],
): string | undefined {
  const textes = [echange.question, echange.resume, ...echange.points].map(
    (t) => ` ${normaliser(t)} `,
  );
  const reconnues = lignes.filter((ligne) => {
    const nom = ` ${normaliser(ligne.nom)} `;
    return textes.some((texte) => texte.includes(nom));
  });
  return reconnues.length === 1 ? reconnues[0]!.ligneId : undefined;
}
