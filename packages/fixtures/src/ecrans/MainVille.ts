import { ecran } from "../ecran";

/** 1b · Accueil, mode « dans la même ville » : ville détectée, départ, arrivée. */
export const MainVille = ecran({
  planche: "MainVille",
  donnees: {
    marque: "AfriMove",
    salutation: "Bonjour Aïcha",
    direct: "DIRECT · 07:38",
    mode: { entreVilles: "Entre villes", memeVille: "Dans la même ville" },
    ville: {
      nom: "Douala",
      detection: "· détectée par ta position",
      changer: "Changer de ville ▾",
    },
    itineraire: {
      departLibelle: "Départ",
      depart: "Akwa, marché central · ma position",
      arriveeLibelle: "Arrivée",
      arrivee: "Bonabéri, carrefour Ancien Dalip",
    },
    quand: ["Maintenant", "Dans 1 h", "Chaque matin 07:00"],
    quandActif: "Maintenant",
    liste: {
      resume: "Akwa → Bonabéri · 9 km",
      filtres: ["Tout", "Moto", "Covoit", "Bus"],
      offres: [
        {
          delai: "3 min",
          type: "Covoiturage",
          qui: "Clarisse · vérifiée",
          detail: "Hyundai · 3 places · passe par Bonanjo · 25 min",
          prix: 700,
        },
        {
          delai: "5 min",
          type: "Moto-taxi",
          qui: "Paul · casque fourni",
          detail: "vient te chercher · 18 min de trajet",
          prix: 500,
        },
        {
          delai: "07:50",
          type: "Bus de ville",
          qui: "ligne 3 · Socatur",
          detail: "arrêt Marché central · 40 min · 12 places",
          prix: 250,
        },
        {
          delai: "08:00",
          type: "Covoiturage",
          qui: "Jean-Marc · régulier",
          detail: "chaque matin · Toyota · 2 places · 4,8 ★",
          prix: 600,
        },
      ],
    },
    raccourcis: [
      { titre: "Colis en ville", detail: "moto · dès 1 000 F" },
      { titre: "Je conduis", detail: "proposer mon trajet" },
    ],
  },
});
