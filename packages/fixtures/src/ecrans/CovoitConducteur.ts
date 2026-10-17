import { ecran } from "../ecran";

/** 6c · Covoiturage, je conduis : les trajets publiés de Samuel et les passagers qui cherchent. */
export const CovoitConducteur = ecran({
  planche: "CovoitConducteur",
  donnees: {
    titre: "Covoiturage",
    conducteur: "Samuel · vérifié · 4,9 ★",
    onglets: {
      entreVilles: "Entre villes",
      enVille: "En ville · Douala",
      aide: "glisse pour changer",
    },
    role: { passager: "Je suis passager", conducteur: "Je conduis" },
    resume: [
      { libelle: "Semaine", valeur: 12000, detail: "reçus par MoMo" },
      { libelle: "Trajets", valeur: 112, detail: "0 annulation" },
      { libelle: "Pièces", valeur: "OK", detail: "permis · carte grise" },
    ],
    publies: {
      titre: "Mes trajets publiés",
      total: 2,
      trajets: [
        {
          heure: "08:30",
          jour: "sam.",
          trajet: "Douala → Kribi · 2 places",
          reservation: "1 réservée",
          detail: "· Aïcha N. · payée 4 000 · 1 libre",
          action: "Gérer",
        },
        {
          heure: "17:00",
          jour: "dim.",
          trajet: "Kribi → Douala · 3 places",
          detail: "0 réservée · visible par 240 voyageurs",
          action: "Gérer",
        },
      ],
    },
    demandes: {
      titre: "Passagers qui cherchent une voiture",
      sens: "sur tes trajets",
      liste: [
        {
          passager: "Marthe N.",
          detail: "· Douala → Kribi · dimanche matin · 1 place",
          note: "· 4,7 ★",
          action: "Proposer 08:30",
        },
        {
          passager: "Éric et Nadia",
          detail: "· Kribi → Douala · dimanche · 2 places",
          action: "Proposer 17:00",
        },
      ],
    },
    paiement:
      "Tu es payé par MoMo à l'arrivée, quand le passager confirme ou 2 h après l'heure prévue. AfriMove garde 250 F par place. Partage de frais, pas de bénéfice.",
    action: {
      libelle: "Proposer mon trajet",
      detail: "touche 1 · trajet, places, prix · publié en 10 s",
    },
  },
});
