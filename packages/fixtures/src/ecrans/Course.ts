import { ecran } from "../ecran";

/** 8 · Moto ou taxi vers la gare d'Akwa : partir à 07:10 pour être au quai 20 min avant. */
export const Course = ecran({
  planche: "Course",
  donnees: {
    carte: ["Chez toi · Bonapriso", "Gare Akwa · Bêta Express", "Jean · 3 min"],
    depart: {
      consigne: "Pour être au quai 20 min avant",
      heure: "Partir 07:10",
      trajet: "12 min de trajet",
      bus: "bus à 08:00",
    },
    modes: [
      { libelle: "Moto", prix: 700, choisi: true },
      { libelle: "Taxi", prix: 1500, choisi: false },
      { libelle: "Avec 2 valises", choisi: false },
    ],
    chauffeur: {
      initiales: "JK",
      nom: "Jean K.",
      type: "moto-taxi",
      reputation: "vérifié · 4,8 ★",
      detail: "Casque passager · LT 203 MT · connaît la gare",
    },
    horaires: [
      { libelle: "Jean vient te chercher à", heure: "07:10" },
      { libelle: "Arrivée au quai Bêta Express", heure: "07:22" },
      { libelle: "Payé avec le billet · un seul paiement", montant: 700 },
    ],
    action: "Réserver la moto pour 07:10",
    rappel: "Rappel 10 min avant. Annulation gratuite jusqu'à 06:55.",
  },
});
