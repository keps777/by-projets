import { ecran } from "../ecran";

/** 31b · L'assistant répond : pourquoi Bafoussam baisse (le mercredi et le 10:00), puis « et si je baisse à 3 500 ? ». */
export const AssistantReponse = ecran({
  planche: "AssistantReponse",
  donnees: {
    titre: "L'assistant",
    detail: "Réponse en 4 s · sur tes chiffres des 30 derniers jours",
    echanges: [
      {
        question: "Pourquoi Bafoussam baisse ?",
        reponse: {
          resume:
            "Bafoussam fait − 14 % sur deux semaines. Ce n'est pas la demande, c'est le mercredi et le 10:00.",
          points: [
            "1. Les deux mercredis sont à 42 % de remplissage : le marché de Bafoussam a changé de jour, les commerçantes montent le mardi soir maintenant.",
            "2. Le 10:00 Douala → Bafoussam part à 55 % depuis qu'Oméga a mis un 09:30 à 3 500 (500 de moins).",
            "3. Les colis, eux, montent : + 9 %. La ligne n'est pas malade, l'horaire l'est.",
          ],
          actions: ["Ajouter un départ mardi 17:00", "Voir la ligne en détail"],
          sources:
            "Sources : tes ventes, les scans au quai, les prix publics des autres compagnies sur AfriMove. Jamais leurs chiffres.",
        },
      },
      {
        question: "Et si je baisse à 3 500 moi aussi ?",
        reponse: {
          resume:
            "À 3 500, il te faut 6 passagers de plus par départ pour gagner la même chose. Sur 30 jours, tu les as eus seulement les vendredis et samedis. Je ne baisserais pas le prix : je déplacerais le 10:00 à 09:15, c'est le créneau vide, et je garderais 4 000.",
          simulation: "simulation : + 1,5 M / mois à 09:15 · − 0,4 M / mois à 3 500",
        },
      },
    ],
    saisie: "Autre question…",
  },
  visuel: {
    // 14 jours de remplissage (hauteur en %) : les deux mercredis (3e et 10e jour) sont en rouge.
    remplissageParJour: [80, 78, 42, 74, 90, 100, 70, 76, 72, 38, 70, 86, 96, 66],
    mercredis: [3, 10],
  },
});
