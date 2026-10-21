import { ecran } from "../ecran";

/** 22c · La fiche de la boutique en 3 minutes : « Boutique Chez Thérèse », Tamdja, Bafoussam (étape 1 / 3). */
export const RelaisInscription = ecran({
  planche: "RelaisInscription",
  donnees: {
    titre: "Ta boutique",
    detail: "Étape 1 / 3 · la fiche · tout se corrige après",
    fiche: {
      nom: { libelle: "Nom de la boutique", valeur: "Boutique Chez Thérèse" },
      type: {
        libelle: "Type",
        choix: [
          "Boutique · alimentation",
          "Pharmacie",
          "Call-box",
          "Quincaillerie",
          "Salon de coiffure",
          "Autre",
        ],
        valeur: "Boutique · alimentation",
      },
      ouvert: {
        libelle: "Ouvert",
        choix: ["7 h – 20 h · lun.–sam.", "7 h – 22 h · 7 j / 7", "8 h – 18 h · lun.–ven."],
        valeur: "7 h – 20 h · lun.–sam.",
      },
      position: {
        libelle: "Position · détectée",
        valeur: "Bafoussam · Tamdja, face école publique",
      },
      taille: {
        libelle: "Taille des colis acceptés",
        choix: ["Petits et moyens (≤ 10 kg)", "Petits seulement (≤ 3 kg)", "Tous (≤ 30 kg)"],
        valeur: "Petits et moyens (≤ 10 kg)",
      },
      momo: { libelle: "MoMo pour être payé", valeur: "6 99 •• •• 41 · Orange" },
    },
    pieces: [
      { titre: "Photo de la façade", detail: "pour que les clients te trouvent" },
      { titre: "CNI · Ngo Thérèse", detail: "déjà vérifiée à ton inscription AfriMove" },
    ],
    engagement: {
      titre: "Tu t’engages à",
      texte:
        "Scanner chaque colis à la réception et à la remise · ne remettre qu'avec le code et la pièce · garder les colis 7 jours à l'abri · ne jamais ouvrir un colis. AfriMove assure la perte jusqu'à 50 000 F par colis dès lors que les scans sont faits.",
    },
    mention: "Tes infos servent à te trouver sur la carte et à te payer. Rien d'autre.",
    actions: {
      plusTard: { libelle: "Plus tard", detail: "brouillon gardé" },
      envoyer: { libelle: "Envoyer ma fiche", detail: "un agent te rappelle sous 72 h" },
    },
  },
  visuel: { etape: 1, etapes: 3 },
});
