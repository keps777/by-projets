import { ecran } from "../ecran";
import { DEPART_OMEGA_0930 } from "../monde";
import { CAISSE_JOSEPH as K, SESSION_JOSEPH_VALIDEE } from "../partage/caisse";

/** 29 · Rapport du soir, 21:00 : le message WhatsApp envoyé au patron et aux superviseurs. */
export const RapportSoir = ecran({
  planche: "RapportSoir",
  maintenant: "21:00",
  donnees: {
    expediteur: {
      nom: "AfriMove · Alpha Voyages",
      detail: "compte vérifié · répond en 2 min",
      heure: "21:00",
    },
    titre: "Rapport du mardi 5 janvier · 3 gares",
    chiffres: [
      { libelle: "Billets", valeur: 1004, detail: "+6 % vs hier" },
      { libelle: "Colis", valeur: 312, detail: "0 litige" },
      { libelle: "Recette", valeur: "4,41 M", detail: "cash 2,9 · MoMo 1,5" },
    ],
    gares: [
      {
        nom: "Akwa",
        texte: "· 491 billets · 3 guichets clôturés · écart",
        ecart: K.evaluation.ecart,
        suite: "(guichet 2, validé par Essono)",
      },
      {
        nom: "Mvan",
        texte: "· 338 billets · écart",
        ecart: 0,
        suite: "· 1 départ fusionné (16:00 + 16:30)",
      },
      {
        nom: "Bafoussam",
        texte: "· 175 billets · écart",
        ecart: 0,
        suite: "· soute pleine à 10:00",
      },
    ],
    enRoute: {
      nom: "En route",
      texte:
        "· 23 billets vendus par les convoyeurs, tous enregistrés · 1 contrôle : 1 régularisation à Edéa",
    },
    remplissage: { nom: "Remplissage", texte: "· 84 % moyen · le 09:30 Oméga part à 55 %" },
    annulations: {
      nom: "Annulations",
      texte: "· 5 (20 000 F), toutes avec PIN ·",
      enLigne: { nom: "En ligne", texte: "· 61 billets (6 %)" },
    },
    ouvrir: "Ouvrir le détail dans l'app",
    signature: "21:00 · signé Essono (Akwa), Tchinda (Mvan), Fosso (Baf.)",
    question: {
      titre: "Pourquoi le 09:30 Oméga part si vide ?",
      reponse:
        "Trois jours de suite à 55 %. Alpha part 08:30 et 10:00 sur la même ligne, 500 F moins cher. Deux options : décaler à 11:00 (créneau vide chez tout le monde), ou aligner le prix. L'assistant a préparé la simulation.",
      lien: "Voir →",
    },
    saisie: "Pose une question sur tes chiffres…",
  },
  entites: { departs: [DEPART_OMEGA_0930], sessions: [SESSION_JOSEPH_VALIDEE] },
});
