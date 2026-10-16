import { ecran } from "../ecran";

/** 1c · Accueil, filtre déroulant : classe, compagnies (une, plusieurs, toutes), préférées. */
export const MainFiltres = ecran({
  planche: "MainFiltres",
  donnees: {
    marque: "AfriMove",
    salutation: "Bonjour Aïcha",
    direct: "DIRECT · 07:38",
    mode: { entreVilles: "Entre villes", memeVille: "Dans la même ville" },
    trajet: { depart: "Douala", arrivee: "Yaoundé", jour: "Aujourd'hui" },
    titre: "Filtrer les départs",
    classe: { titre: "Classe", options: ["Toutes", "VIP · clim", "Classique"], active: "Toutes" },
    compagnies: {
      titre: "Compagnies · une, plusieurs ou toutes",
      legende: "★ = préférée",
      toutes: { libelle: "Toutes · 5 compagnies", departs: "14 départs", coche: true },
      liste: [
        {
          nom: "Bêta Express",
          etiquette: "VIP",
          departs: "4 départs",
          coche: true,
          preferee: true,
        },
        { nom: "Alpha Voyages", departs: "5 départs", coche: true, preferee: true },
        { nom: "Oméga Transports", departs: "3 départs", coche: true, preferee: false },
        {
          nom: "Général Express",
          etiquette: "nuit",
          departs: "1 départ",
          coche: true,
          preferee: false,
        },
        { nom: "Touristique Express", departs: "1 départ", coche: true, preferee: false },
      ],
    },
    aussi: {
      titre: "Aussi",
      options: ["Covoiturage ✓", "Matin seulement", "Places côte à côte", "≤ 5 000 F"],
    },
    actions: { effacer: "Effacer", voir: "Voir les 14 départs" },
    note: "Tes préférées s'affichent toujours en premier. Le filtre reste mémorisé pour ce trajet.",
  },
});
