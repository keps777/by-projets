import { ecran } from "../ecran";
import { EFFECTIFS, GUICHETIERS, TOTAL_EQUIPE } from "../partage/equipe";

/** 34c · La liste de l'équipe (pop-up sur les réglages) : filtre par rôle, 9 guichetiers affichés. */
export const ConfigEquipeListe = ecran({
  planche: "ConfigEquipeListe",
  donnees: {
    fond: { titre: "Configuration", detail: `Équipe · ${TOTAL_EQUIPE} personnes` },
    popup: {
      titre: `Mon équipe · ${TOTAL_EQUIPE} personnes`,
      aide: "touche un rôle pour filtrer · touche un nom pour modifier",
      fermer: "Fermer",
      roles: EFFECTIFS.map((e) => ({ nombre: e.nombre, role: e.role })),
      recherche: "Chercher un nom, un guichet, une gare…",
      personnes: GUICHETIERS.map((g) => ({
        _personneId: g._personneId,
        initiales: g.initiales,
        nom: g.nom,
        lieu: g.lieu,
        detail: g.detail,
        action: g.action,
      })),
      resume: "9 guichetiers · 8 en service · 1 bloquée",
      signature: "Chaque modification est signée par ton PIN",
      actions: ["Fermer", "Ajouter une personne"],
    },
  },
  visuel: { roleFiltre: "guichetiers" },
});
