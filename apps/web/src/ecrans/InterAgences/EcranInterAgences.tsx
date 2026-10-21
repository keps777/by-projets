import { patron } from "@afrimove/api-client";
import { InterAgencesVue } from "./InterAgencesVue";
import type { EtatBloc } from "./types";

/**
 * Écran « Entre compagnies » (AM-132, planche InterAgences.dc.html).
 *
 * Une seule lecture, `patron.useInterAgences` : le colis en correspondance, le règlement de la semaine, la
 * correspondance des voyageurs et les conventions. Aucune écriture ici : le scan de transfert « remis à » / « reçu » se
 * fait dans les écrans des convoyeurs, « Convention … · voir » ouvre la convention et « Ajouter une compagnie » le
 * réseau.
 */
export function EcranInterAgences() {
  const inter = patron.useInterAgences();
  return (
    <InterAgencesVue
      etat={etatDe(inter)}
      vue={inter.data}
      onReessayer={() => {
        void inter.refetch();
      }}
    />
  );
}

function etatDe(requete: ReturnType<typeof patron.useInterAgences>): EtatBloc {
  const vue = requete.data;
  if (vue) {
    return (vue.colisEnCorrespondance?.troncons.length ?? 0) === 0 && vue.conventions.length === 0
      ? "vide"
      : "pret";
  }
  if (requete.isError) return "erreur";
  if (requete.isPending) return "chargement";
  return "vide";
}

export default EcranInterAgences;
