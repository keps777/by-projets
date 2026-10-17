import { patron } from "@afrimove/api-client";
import { EquipeVue } from "./EquipeVue";
import type { EtatBloc } from "./types";

/**
 * Écran « Mes gares, mes gens » (AM-101, planche PatronEquipe.dc.html).
 *
 * Une seule lecture, `useGares` : les gares, les effectifs, les personnes à suivre, les repères et la paie. Aucune
 * écriture ici : toucher une gare ou une personne ouvre son écran, « + personne · + gare » ouvre les réglages et
 * « Payer les salaires » ouvre le financement, où la paie se signe.
 */
export function EcranPatronEquipe() {
  const gares = patron.useGares();
  const vue = gares.data;
  return (
    <EquipeVue
      etat={etatDe(gares)}
      vue={vue}
      onReessayer={() => {
        void gares.refetch();
      }}
    />
  );
}

function etatDe(requete: ReturnType<typeof patron.useGares>): EtatBloc {
  const vue = requete.data;
  if (vue) return vue.gares.length === 0 && vue.personnes.length === 0 ? "vide" : "pret";
  if (requete.isError) return "erreur";
  if (requete.isPending) return "chargement";
  return "vide";
}

export default EcranPatronEquipe;
