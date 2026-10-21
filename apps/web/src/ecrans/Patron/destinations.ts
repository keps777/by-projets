import { urlPlanche } from "@/coquille/planches";
import type { Alerte } from "./direct";

/** Une gare de « Mes gares, mes gens » : de quoi retrouver la gare dont parle une alerte. */
export interface GareConnue {
  id: string;
  nom: string;
}

export type CategorieAlerte = Alerte["categorie"];

/** La gare dont le nom figure dans le texte (le nom le plus long l'emporte : « Yaoundé Mvan » avant « Mvan »). */
function gareCitee(
  texte: string,
  gares: readonly GareConnue[] | undefined,
): GareConnue | undefined {
  const bas = texte.toLowerCase();
  return [...(gares ?? [])]
    .sort((a, b) => b.nom.length - a.nom.length)
    .find((g) => g.nom !== "" && bas.includes(g.nom.toLowerCase()));
}

/**
 * Écran qui permet d'agir sur une alerte (navigation de la maquette) :
 * écart de caisse -> la gare (PatronGare) ; colis en correspondance -> Entre compagnies ; PIN faux -> Mes gares, mes
 * gens ; panne -> le bus ; MoMo sans correspondance -> Comptable ; avance -> le dossier de financement.
 *
 * L'alerte d'écart de caisse porte l'identifiant d'une session, pas celui d'une gare : la gare est retrouvée par son
 * nom dans le texte (« Guichet 2 Akwa ») ; sans elle, on ouvre la liste des gares. Une alerte sans objet précis
 * (bus ou dossier absent) ouvre la liste de son domaine ; une alerte « autre » ouvre l'assistant.
 */
export function destinationAlerte(
  alerte: Alerte,
  gares: readonly GareConnue[] | undefined,
): string {
  switch (alerte.categorie) {
    case "ecart_caisse": {
      const gare = gareCitee(alerte.texte, gares);
      return gare ? urlPlanche("PatronGare", { gareId: gare.id }) : urlPlanche("PatronEquipe");
    }
    case "correspondance":
      return urlPlanche("InterAgences");
    case "pin_bloque":
      return urlPlanche("PatronEquipe");
    case "panne_bus":
      return alerte.cibleId
        ? urlPlanche("AnalysesBus", { busId: alerte.cibleId })
        : urlPlanche("Analyses");
    case "momo_sans_correspondance":
      return urlPlanche("Comptable");
    case "financement":
      return alerte.cibleId
        ? urlPlanche("FinancementDemande", { dossierId: alerte.cibleId })
        : urlPlanche("Financement");
    case "autre":
      return urlPlanche("Assistant");
  }
}

export type TonAlerte = "ambre" | "rouge" | "bleu" | "vert";

/** Couleur du point de l'alerte, relevée dans la planche : écart et MoMo ambre, PIN et panne rouge, correspondance bleu, avance vert. */
export const TON_ALERTE: Record<CategorieAlerte, TonAlerte> = {
  ecart_caisse: "ambre",
  correspondance: "bleu",
  pin_bloque: "rouge",
  panne_bus: "rouge",
  momo_sans_correspondance: "ambre",
  financement: "vert",
  autre: "ambre",
};
