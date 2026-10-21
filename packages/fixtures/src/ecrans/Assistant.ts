import { ecran } from "../ecran";
import { DEPART_OMEGA_0930 } from "../monde";

/** 31 · L'assistant du patron : l'argent qui fuit (Joseph, le mardi) et l'argent à gagner (le 09:30 Oméga). */
export const Assistant = ecran({
  planche: "Assistant",
  donnees: {
    titre: "L'assistant",
    sousTitre: "Il lit tes chiffres, il explique, il propose. Tu décides.",
    fuite: {
      titre: "1 · Argent qui fuit",
      periode: "10 derniers jours",
      constat: "Guichet 2 d'Akwa : 3 écarts négatifs, toujours le mardi, toujours Joseph.",
      explication:
        "Total − 4 500. Petit, mais régulier. Les mardis, le 05:30 Yaoundé est en mode cadence et 11 billets ont été vendus sans numéro de téléphone.",
      actions: ["Contrôle inopiné mardi", "Numéro obligatoire en cadence"],
    },
    gain: {
      titre: "2 · Argent à gagner",
      sousTitre: "simulation",
      constat: "Oméga te prend 40 clients par jour sur le 09:30. Décale ton 10:00 à 09:15.",
      simulation: [
        { libelle: "aujourd'hui", remplis: 24, capacite: 40 },
        { libelle: "à 09:15", remplis: 37, capacite: 40 },
        { libelle: "par mois", valeur: "+ 1,5 M" },
      ],
      base: "Basé sur 30 jours de ventes des deux compagnies, en données anonymes du réseau. Tes voyageurs partent plus tôt le matin.",
      action: "Décaler le 10:00 à 09:15 dès lundi",
    },
    questions: ["Pourquoi Bafoussam baisse ?", "Quel bus coûte le plus ?", "Prévision de samedi"],
    saisie: "Demande en français, en vocal aussi…",
  },
  visuel: {
    // 10 jours, une barre par jour : les jours 2, 8 et 10 sont les écarts négatifs (ambre).
    ecartsParJour: { jours: 10, ambre: [2, 8, 10], hauteursPx: { 2: 26, 8: 38, 10: 18 } },
  },
  entites: { departs: [DEPART_OMEGA_0930] },
});
