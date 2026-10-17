import { ecran } from "../ecran";
import { BUS_ANALYSES, LIGNES_ANALYSEES, RECETTE_PAR_JOUR, SEMAINE } from "../partage/analyses";

/** 32 · Analyses de la semaine : recette par jour, remplissage par ligne, net par bus. */
export const Analyses = ecran({
  planche: "Analyses",
  donnees: {
    titre: "Analyses",
    periode: `${SEMAINE.libelle} · ${SEMAINE.gares} gares`,
    periodes: ["Semaine", "Mois", "Trimestre", "Année"],
    recetteParJour: {
      titre: "Recette par jour",
      total: "28,4 M",
      variation: "+ 5 %",
      jours: RECETTE_PAR_JOUR.initiales,
      lecture:
        "Vendredi et samedi font 41 % de la semaine. Le creux du mercredi est le plus profond à Bafoussam.",
    },
    lignes: {
      titre: "Par ligne · remplissage",
      aide: "7 lignes · glisser",
      liste: [
        ...LIGNES_ANALYSEES.map((l) => ({
          ligne: l.nom,
          remplissage: l.remplissage,
          recette: l.recette,
        })),
        { ligne: "Colis · toutes lignes", colis: 2104, recette: "2,1 M" },
      ],
    },
    bus: {
      titre: "Par bus · net",
      aide: "14 bus · glisser",
      liste: BUS_ANALYSES.map((b) => ({
        bus: b.immatriculation,
        chauffeur: `· ${b.chauffeur}`,
        trajets: b.trajets,
        net: b.net,
        incident: b.incident,
      })),
    },
    actions: ["Exporter Excel", "Demander à l'assistant"],
  },
  visuel: {
    recetteParJour: RECETTE_PAR_JOUR,
    // Largeur de la barre de chaque ligne : 91, 78, 61, 83, 88, 74 % ; les colis à 84 %.
    couleurs: { vert: [91, 83, 88], ambre: [78, 74], rouge: [61] },
  },
});
