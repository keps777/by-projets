import { ErreurHttp, patron } from "@afrimove/api-client";
import { useParams } from "react-router";
import { EditeurPersonne } from "./EditeurPersonne";
import { EtatPersonne } from "./etats";

/** Identifiant que « + personne » (réglages) met dans l'adresse pour une création : `/reglages/personne/nouvelle`. */
const NOUVELLE = "nouvelle";

/**
 * Écran ConfigPersonne (AM-123, planche ConfigPersonne.dc.html) : modifier ou ajouter une personne, de la route
 * `/(patron)/reglages/personne/[personneId]`.
 *
 * La fiche vient de `usePersonneEditable`, les gares (le choix de « Gare », le jour de la paie) de `useGares`. Avec
 * l'identifiant « nouvelle », même écran, champs vides : aucune fiche n'est lue.
 */
export function EcranConfigPersonne() {
  const { personneId = "" } = useParams();
  return personneId === NOUVELLE ? <Creation /> : <Modification personneId={personneId} />;
}

function Creation() {
  const gares = patron.useGares();
  if (gares.data) return <EditeurPersonne key={NOUVELLE} personne={null} gares={gares.data} />;
  if (gares.isError) {
    return <EtatPersonne etat="erreur" onReessayer={() => void gares.refetch()} />;
  }
  return <EtatPersonne etat="chargement" />;
}

function Modification({ personneId }: { personneId: string }) {
  const requete = patron.usePersonneEditable(personneId);
  const gares = patron.useGares();

  if (requete.data && gares.data) {
    return <EditeurPersonne key={requete.data.id} personne={requete.data} gares={gares.data} />;
  }
  if (requete.isError) {
    const erreur = requete.error;
    return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
      <EtatPersonne etat="vide" />
    ) : (
      <EtatPersonne etat="erreur" onReessayer={() => void requete.refetch()} />
    );
  }
  if (gares.isError) {
    return <EtatPersonne etat="erreur" onReessayer={() => void gares.refetch()} />;
  }
  return <EtatPersonne etat="chargement" />;
}
