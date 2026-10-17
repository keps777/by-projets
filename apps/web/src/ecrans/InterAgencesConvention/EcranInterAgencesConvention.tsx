import { ErreurHttp, colis } from "@afrimove/api-client";
import { ConventionVue, type EtatEcran } from "./convention-vue";

/**
 * Écran Convention entre deux compagnies (AM-133, planche InterAgencesConvention.dc.html) : la pastille du statut, les
 * tronçons et leurs parts, les cinq règles, les signatures par PIN des deux patrons, les chiffres du trimestre.
 *
 * Tout vient de `useConventionInterAgences` (`GET /inter-agences/conventions/:conventionId`). Aucune écriture : la
 * convention est signée avant d'arriver ici, et chaque compagnie n'y voit que le colis, jamais les ventes de l'autre.
 * « Historique · règlements » mène au comptable, « Retour » et « Retour · entre compagnies » à InterAgences.
 */
export function EcranInterAgencesConvention({
  conventionId,
}: {
  conventionId: string | undefined;
}) {
  const requete = colis.useConventionInterAgences(conventionId ?? "");
  return (
    <ConventionVue
      etat={etatDe(requete)}
      convention={requete.data}
      onReessayer={() => void requete.refetch()}
    />
  );
}

/** « Convention inconnue » (404) n'est pas une panne : réessayer ne la fera pas apparaître. */
function introuvable(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && erreur.statut === 404;
}

function etatDe(requete: {
  data: unknown;
  error: unknown;
  isError: boolean;
  isPending: boolean;
}): EtatEcran {
  if (requete.data) return "pret";
  if (requete.isError) return introuvable(requete.error) ? "vide" : "erreur";
  if (requete.isPending) return "chargement";
  return "vide";
}

export default EcranInterAgencesConvention;
