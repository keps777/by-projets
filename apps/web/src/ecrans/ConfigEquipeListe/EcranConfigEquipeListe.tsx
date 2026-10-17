import { patron } from "@afrimove/api-client";
import { useState } from "react";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { EquipeListeVue } from "./EquipeListeVue";
import type { EtatListe, Role } from "./types";

/**
 * Écran « la liste de l'équipe » (AM-122, planche ConfigEquipeListe.dc.html) : le pop-up des réglages, route
 * `/(patron)/reglages/equipe`.
 *
 * Une seule lecture, `useEquipe` : l'effectif par rôle, le total et toutes les personnes. Le choix du rôle et la
 * recherche se font sur place, sans nouvelle requête, et se combinent. Aucune écriture ici : toucher une personne ou
 * « Ajouter une personne » ouvre ConfigPersonne, où la modification est signée par le PIN du patron. « Fermer »,
 * Échap, le voile et « Retour » reviennent aux réglages.
 */
export function EcranConfigEquipeListe() {
  const equipe = patron.useEquipe();
  const navigate = useNavigate();
  const [choisi, setChoisi] = useState<Role | null>(null);
  const [recherche, setRecherche] = useState("");

  const liste = equipe.data;
  // Le premier rôle de l'effectif (les guichetiers) est celui de la planche ; un rôle qui n'existe plus est écarté.
  const role = liste?.roles.find((r) => r.role === choisi)?.role ?? liste?.roles[0]?.role ?? null;
  const etat: EtatListe = liste ? "pret" : equipe.isError ? "erreur" : "chargement";

  return (
    <EquipeListeVue
      etat={etat}
      liste={liste}
      role={role}
      onRole={setChoisi}
      recherche={recherche}
      onRecherche={setRecherche}
      onFermer={() => {
        void navigate(urlPlanche("Config"));
      }}
      onReessayer={() => {
        void equipe.refetch();
      }}
    />
  );
}

export default EcranConfigEquipeListe;
