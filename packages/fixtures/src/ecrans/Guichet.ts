import { ecran } from "../ecran";

/** 18 · Guichet : l'accueil de l'agent, tout à une touche. Joseph M., guichet 2 d'Akwa. */
export const Guichet = ecran({
  planche: "Guichet",
  maintenant: "08:18",
  donnees: {
    poste: {
      agence: "Alpha Voyages · Akwa",
      agent: "Guichet 2 · Joseph M. · caisse ouverte 05:02",
      synchro: "SYNC",
    },
    compteurs: [
      { libelle: "Billets", valeur: 184, detail: "ce matin" },
      { libelle: "Colis", valeur: 41, detail: "dont 3 à charger" },
      { libelle: "En caisse", valeur: "612 k", detail: "écart 0" },
    ],
    vendre: {
      titre: "Vendre un billet",
      detail: "départ · siège · nom · encaisser · imprimer : 3 touches",
    },
    tuiles: [
      { titre: "Enregistrer un colis", detail: "photo, étiquette, SMS" },
      { titre: "Dépôt prépayé", detail: "scanner le code du client" },
      { titre: "Quai · embarquer", detail: "08:30 Yaoundé · 31/40 scannés" },
      { titre: "Ma caisse", detail: "fermer, compter, écart" },
    ],
    raccourcis: ["Mode cadence · file de 40", "Appeler le superviseur"],
    prochainDepart:
      "Prochain départ dans 12 min : 08:30 Yaoundé, 9 places. Le 09:00 Bafoussam ouvre à la vente.",
    navigation: ["Guichet", "Vendre", "Colis", "Quai", "Caisse"],
  },
});
