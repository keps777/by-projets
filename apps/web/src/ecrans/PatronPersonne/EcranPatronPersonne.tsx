import { ErreurHttp, patron } from "@afrimove/api-client";
import { useMemo } from "react";
import { useParams } from "react-router";
import { EtatFiche } from "./etats";
import { FicheVue } from "./FicheVue";

/**
 * Écran PatronPersonne (AM-103, planche PatronPersonne.dc.html) : une personne de l'équipe vue par le patron, de la
 * route `/(patron)/personnes/[personneId]`.
 *
 * La fiche vient de `useFichePersonne` (le texte d'analyse des écarts est celui de l'assistant, tel que l'API le
 * donne) ; `useGares` ne sert qu'à retrouver la gare de la personne pour « Changer de guichet / gare ». Aucune écriture
 * ici : chaque action ouvre l'écran qui permet d'agir.
 */
export function EcranPatronPersonne() {
  const { personneId = "" } = useParams();
  const fiche = patron.useFichePersonne(personneId);
  const gares = patron.useGares();

  const lieu = fiche.data?.personne.lieu;
  const gareId = useMemo(() => {
    if (!lieu || !gares.data) return undefined;
    const bas = lieu.toLowerCase();
    // Le nom le plus long l'emporte : « Yaoundé Mvan » avant « Mvan ».
    return [...gares.data.gares]
      .sort((a, b) => b.nom.length - a.nom.length)
      .find((g) => g.nom !== "" && bas.includes(g.nom.toLowerCase()))?.id;
  }, [lieu, gares.data]);

  if (fiche.data) return <FicheVue fiche={fiche.data} gareId={gareId} />;
  if (fiche.isError) {
    const erreur = fiche.error;
    return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
      <EtatFiche etat="vide" />
    ) : (
      <EtatFiche etat="erreur" onReessayer={() => void fiche.refetch()} />
    );
  }
  return <EtatFiche etat="chargement" />;
}
