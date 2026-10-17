import { ErreurHttp, patron } from "@afrimove/api-client";
import { GareVue, type EtatGare } from "./gare-vue";

/**
 * Écran Une gare en détail (AM-102, planche PatronGare.dc.html) : la gare vue par le patron.
 *
 * Tout vient de `useGare` (caisse, guichets, quais, journal du jour, `GET /patron/gares/:gareId`). Aucune écriture :
 * le patron voit tout et ne touche pas la caisse, les validations restent au superviseur. Chaque guichet ouvre la fiche
 * de la personne, chaque départ le quai, le pied mène au rapport d'hier et à la caisse en direct.
 */
export function EcranPatronGare({ gareId }: { gareId: string | undefined }) {
  const gare = patron.useGare(gareId ?? "");
  return <GareVue etat={etatDe(gare)} gare={gare.data} onReessayer={() => void gare.refetch()} />;
}

/** « Gare inconnue » (404) n'est pas une panne : réessayer ne la fera pas apparaître. */
function introuvable(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && erreur.statut === 404;
}

function etatDe(requete: {
  data: unknown;
  error: unknown;
  isError: boolean;
  isPending: boolean;
}): EtatGare {
  if (requete.data) return "pret";
  if (requete.isError) return introuvable(requete.error) ? "introuvable" : "erreur";
  if (requete.isPending) return "chargement";
  return "introuvable";
}

export default EcranPatronGare;
