import { ecran } from "../ecran";

/** 9 · Monter en route : le voyageur est à Pouma, trois bus passent avec des places. */
export const Arret = ecran({
  planche: "Arret",
  maintenant: "09:51",
  donnees: {
    titre: "Monter en route",
    position: "Tu es à Pouma · bus qui passent avec des places",
    gps: "GPS",
    ligne: {
      libelle: "Ligne Douala → Yaoundé",
      sens: "vers Yaoundé",
      arrets: ["Douala", "Edéa", "Pouma · toi", "Boumnyebel", "Yaoundé"],
      pointDeMontee:
        "Point de montée : station Total Pouma, côté droit. Le convoyeur te scanne à la montée.",
    },
    bus: [
      {
        heure: "10:05",
        dans: "dans 14 min",
        compagnie: "Bêta Express VIP",
        places: "· 3 places",
        detail: "parti de Douala 08:04 · arrive Yaoundé 11:35",
        prix: 4500,
        mention: "prorata",
      },
      {
        heure: "10:40",
        dans: "dans 49 min",
        compagnie: "Alpha Voyages",
        places: "· 7 places",
        detail: "classique · arrive Yaoundé 12:20",
        prix: 2500,
        mention: "prorata",
      },
      {
        heure: "11:10",
        dans: "dans 1 h 19",
        compagnie: "Oméga Transports",
        places: "· 1 place",
        detail: "classique · arrive Yaoundé 12:50",
        prix: 2400,
        mention: "prorata",
      },
    ],
    note: "Tu paies maintenant, la place est bloquée. Le bus s'arrête parce qu'il sait que tu es là. Prix au prorata de la distance, fixé par la compagnie.",
  },
});
