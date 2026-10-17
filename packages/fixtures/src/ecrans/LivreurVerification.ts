import { repartitionLivraison } from "@afrimove/domain";
import { ecran } from "../ecran";

const course = repartitionLivraison(1000).livreur;

/** 23c · Vérification de la demande de livreur (dossier L-BAF-0087, badge n° 87), jusqu'à la première course. */
export const LivreurVerification = ecran({
  planche: "LivreurVerification",
  maintenant: "18:41",
  donnees: {
    titre: "Demande envoyée",
    detail: "Livreur · moto · Bafoussam Tamdja · soirs · dossier L-BAF-0087",
    badge: "EN COURS",
    suivi: {
      titre: "Suivi · en direct",
      etapes: [
        {
          fait: true,
          etape: "Fiche reçue",
          detail: "· aujourd’hui 18:40 · SMS de confirmation",
        },
        {
          fait: true,
          etape: "CNI et MoMo au même nom",
          detail: "· vérifiés automatiquement",
        },
        {
          fait: false,
          etape: "Permis et assurance",
          detail: "· lecture par l’app en cours · 2 min · ou l’agent les regarde à la gare",
        },
        {
          fait: false,
          etape: "Formation · 10 min en vidéo",
          detail: "· les 3 règles, le scan, la remise contre code · quiz de 5 questions",
        },
        {
          fait: false,
          etape: "Activation · badge livreur n° 87",
          detail:
            "· l’app passe en mode livreur · tu reçois ta première course dans ta zone, à tes heures",
        },
      ],
    },
    badgeReserve: {
      libelle: "Ton badge · réservé",
      valeur: "L-BAF-0087",
      etat: "actif après la formation",
    },
    demo: {
      libelle: "En attendant",
      titre: "Essayer l'app livreur · démo",
      detail: "mission · accepter · payé le soir →",
    },
    soiree: {
      titre: "Ta première soirée · à quoi ça ressemble",
      texte: `Le bus de 17 h arrive gare Alpha. À 17:40, une mission apparaît : « Gare → Tamdja, 2 kg, 4,1 km, ${course} F ». Tu as 30 s pour accepter. Tu scannes le colis au quai, tu roules, le client te donne son code, tu photographies le colis remis. ${course} F sur ton MoMo le soir même.`,
    },
    particularites: {
      titre: "Tes particularités · modifiables à tout moment",
      texte:
        "Moto · Tamdja, Djeleng, centre · soirs 17 h – 21 h · jusqu'à 10 kg. On ne te propose que ça. Tu passes en « indisponible » d'une touche.",
    },
    actions: {
      modifier: "Modifier ma fiche",
      retour: { libelle: "Retour à mon espace", detail: "je te préviens dès l’activation" },
    },
  },
});
