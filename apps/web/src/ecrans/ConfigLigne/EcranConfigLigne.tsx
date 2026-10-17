import { ErreurHttp, patron } from "@afrimove/api-client";
import { useMemo } from "react";
import { useParams } from "react-router";
import { EditeurLigne } from "./EditeurLigne";
import { EtatLigne } from "./etats";

/**
 * Écran ConfigLigne (AM-121, planche ConfigLigne.dc.html) : modifier une ligne, de la route
 * `/(patron)/reglages/ligne/[ligneId]`.
 *
 * La ligne vient de `useLigneEditable` ; le bus de chaque départ, que cette lecture ne porte pas, vient de l'analyse
 * de la ligne (`useAnalyseLigne`) : sans elle, la planche perd seulement « LT 118 AB · 40 pl. » sous l'heure.
 */
export function EcranConfigLigne() {
  const { ligneId = "" } = useParams();
  const requete = patron.useLigneEditable(ligneId);
  const analyse = patron.useAnalyseLigne(ligneId);

  const bus = useMemo(() => {
    const parDepart = new Map<string, string>();
    for (const depart of analyse.data?.departs ?? []) {
      if (depart.bus !== null) parDepart.set(depart.departId, depart.bus);
    }
    return parDepart;
  }, [analyse.data]);

  if (requete.data) return <EditeurLigne key={requete.data.id} ligne={requete.data} bus={bus} />;
  if (requete.isError) {
    const erreur = requete.error;
    return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
      <EtatLigne etat="vide" />
    ) : (
      <EtatLigne etat="erreur" onReessayer={() => void requete.refetch()} />
    );
  }
  return <EtatLigne etat="chargement" />;
}
