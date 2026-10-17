import { ErreurHttp, patron } from "@afrimove/api-client";
import { RapportVue, type EtatRapport } from "./rapport-vue";

/**
 * Écran Rapport du soir (AM-095, planche RapportSoir.dc.html) : le message WhatsApp de 21 h et sa vue dans l'app.
 *
 * Le rapport vient de `useRapportSoir` (le dernier rapport arrêté, `GET /patron/rapports/soir`, AM-171) ; son texte est
 * écrit par l'API et affiché tel quel. `useTableauDuJour` ne sert qu'à lire le nom de la compagnie de l'en-tête (la
 * lecture est partagée avec l'accueil du patron). Aucune écriture : lire le rapport ne demande aucune touche.
 */
export function EcranRapportSoir() {
  const rapport = patron.useRapportSoir();
  const tableau = patron.useTableauDuJour();

  return (
    <RapportVue
      etat={etatDe(rapport)}
      rapport={rapport.data}
      compagnie={tableau.data?.compagnie}
      onReessayer={() => void rapport.refetch()}
    />
  );
}

/** « Pas encore de rapport » (404 : avant 21 h le premier jour, ou jour inconnu) n'est pas une panne. */
function pasEncoreDeRapport(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && erreur.statut === 404;
}

function etatDe(requete: {
  data: unknown;
  error: unknown;
  isError: boolean;
  isPending: boolean;
}): EtatRapport {
  if (requete.data) return "pret";
  if (requete.isError) return pasEncoreDeRapport(requete.error) ? "vide" : "erreur";
  if (requete.isPending) return "chargement";
  return "vide";
}

export default EcranRapportSoir;
