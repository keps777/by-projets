import { ecran } from "../ecran";
import { BUS_LT207, M_NANA } from "../monde";
import { BUS_ANALYSES } from "../partage/analyses";

const bus = BUS_ANALYSES.find((b) => b.immatriculation === BUS_LT207.immatriculation)!;

/** 32c · Analyses, un bus en détail : LT 207 AB (Nana), 2 pannes en 10 jours, « à surveiller ». */
export const AnalysesBus = ecran({
  planche: "AnalysesBus",
  donnees: {
    titre: `${bus.immatriculation} · ${bus.chauffeur}`,
    detail: `Coaster ${BUS_LT207.capacite} places · 2019 · ${bus.trajets} trajets cette semaine`,
    badge: "À SURVEILLER",
    _chauffeurId: M_NANA.id,
    chiffres: [
      { libelle: "Recette", valeur: "3,1 M", detail: "5 trajets · 71 %" },
      { libelle: "Dépenses", valeur: "2,5 M", detail: "carburant 1,6 · pannes 0,7" },
      { libelle: "Net", valeur: bus.net, detail: "flotte : + 2,1 M en moyenne" },
    ],
    netParSemaine: {
      titre: "Net par semaine · 8 semaines",
      tendance: "− 62 % depuis la panne du 12 nov.",
      semaines: ["S41", "S42", "S43", "S44", "S45", "S46", "S47", "S48"],
    },
    trajets: {
      titre: "Cette semaine · trajet par trajet",
      aide: "5 · 2 pannes",
      liste: [
        {
          quand: "Lun 06:00 · Douala → Bafoussam",
          detail: "28 / 30 · 98 000 · à l’heure",
          net: "+ 61 k",
        },
        {
          quand: "Mar 06:00 · Douala → Bafoussam",
          detail: "panne embrayage à Mbouda · 2 h 10 · 30 replacés",
          net: "− 310 k",
        },
        {
          quand: "Jeu 14:00 · Bafoussam → Douala",
          detail: "19 / 30 · 66 500 · retard 25 min",
          net: "+ 22 k",
        },
        {
          quand: "Ven 06:00 · Douala → Bafoussam",
          detail: "30 / 30 · 105 000 · à l’heure",
          net: "+ 68 k",
        },
        {
          quand: "Sam 09:00 · Douala → Bafoussam",
          detail: "panne batterie au départ · 40 min · 30 gardés",
          net: "− 45 k",
        },
      ],
    },
    assistant: {
      titre: "L'assistant",
      texte:
        "Deux pannes en 10 jours sur le même bus, c'est de l'entretien, pas de la malchance. Une révision complète coûte ≈ 180 k ; chaque panne t'a coûté plus. Je mettrais LT 207 au garage lundi et je passerais Nana sur LT 330 (8 trajets, 0 incident).",
    },
    actions: {
      flotte: "Toute la flotte",
      assistant: { libelle: "Demander à l'assistant", detail: "révision lundi · qui remplace ?" },
    },
  },
  visuel: {
    // Net par semaine (hauteur en %) : S41 à S45 stables, S46 s'effondre après la panne du 12 nov.
    netParSemainePx: [88, 92, 84, 90, 96, 34, 58, 30],
  },
});
