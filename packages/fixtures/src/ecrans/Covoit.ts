import { ecran } from "../ecran";

/** 6 · Covoiturage interurbain : je suis passager, Douala → Kribi ce matin. */
export const Covoit = ecran({
  planche: "Covoit",
  donnees: {
    titre: "Covoiturage",
    ville: "Douala",
    onglets: {
      entreVilles: "Entre villes",
      enVille: "En ville · Douala",
      aide: "glisse pour changer",
    },
    role: { passager: "Je suis passager", conducteur: "Je conduis" },
    trajet: { depart: "Douala", arrivee: "Kribi", quand: "Ce matin" },
    filtres: ["Tous", "Clim", "Femmes", "Grand bagage", "≤ 4 000"],
    offres: [
      {
        initiales: "SA",
        conducteur: "Samuel E.",
        reputation: "· vérifié · 4,9 ★ · 112 trajets",
        vehicule: "Toyota Corolla grise · LT 882 CE · clim · 2 places",
        prix: 4000,
        heure: "08:30",
        depart: "Départ Bonapriso, pharmacie du Rond-point · 2 h 30",
        arrivee: "Arrivée Kribi centre vers 11:00 · 2 arrêts possibles",
        garantie: "Payé dans l'app · remboursé si Samuel annule",
        action: "Réserver · touche 2",
      },
      {
        initiales: "MN",
        conducteur: "Marthe N.",
        reputation: "· vérifiée · 4,7 ★",
        vehicule: "10:00 · Akwa · Hyundai · 3 places · femmes bienvenues",
        prix: 3500,
      },
      {
        initiales: "DK",
        conducteur: "Didier K.",
        reputation: "· vérifié · 4,6 ★",
        vehicule: "14:00 · Bonamoussadi · pick-up · 4 places · grand bagage OK",
        prix: 3000,
      },
    ],
    note: "Conducteurs vérifiés (pièce, permis, voiture). Trajet partagé avec un proche en 1 touche. Argent libéré au conducteur à l'arrivée. Aucun bus avant 14 h sur Kribi : le covoit comble le trou.",
  },
});
