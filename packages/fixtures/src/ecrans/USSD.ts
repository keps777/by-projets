import { ecran } from "../ecran";

/** 11 · USSD *123# et WhatsApp : le même service sur un téléphone simple. */
export const USSD = ecran({
  planche: "USSD",
  donnees: {
    titre: "Sans internet",
    sousTitre: "Le même service sur un téléphone à touches",
    ussd: {
      titre: "USSD · tape *123#",
      ecran: [
        "AfriMove",
        "1 Billet",
        "2 Mon billet",
        "3 Colis",
        "4 Suivre bus",
        "5 Proche",
        "0 Aide",
        "Repondre: 1",
        "--------",
        "Douala>Yaounde",
        "1 08:00 Beta VIP 7500",
        "2 08:30 Alpha 4000",
        "3 09:30 Omega 3800",
        "Place: 2",
        "Payer MoMo? 1=oui",
      ],
      clavier: ["1", "2", "3", "4", "5", "6", "*", "0", "#"],
      note: "3 réponses = un billet. Le SMS arrive avec le code à 4 chiffres. Même règles, mêmes prix, zéro frais en plus.",
    },
    whatsapp: {
      titre: "WhatsApp · écris « billet »",
      echanges: [
        { _de: "voyageur", texte: ["Billet Douala Yaoundé demain matin"] },
        {
          _de: "afrimove",
          texte: [
            "3 départs demain :",
            "1 · 08:00 Bêta VIP 7 500",
            "2 · 08:30 Alpha 4 000",
            "3 · 09:30 Oméga 3 800",
            "Réponds 1, 2 ou 3.",
          ],
        },
        { _de: "voyageur", texte: ["2"] },
        {
          _de: "afrimove",
          texte: ["Alpha 08:30, siège 7 fenêtre. 4 000 F par MoMo ?", "Oui · Changer de siège"],
        },
        {
          _de: "afrimove",
          texte: ["✓ Payé. Billet ALP-DLA-270106-0031, code 5582. Bon voyage, Aïcha."],
        },
      ],
      vocal:
        "Vocal accepté : « je veux aller à Yaoundé demain ». Réponse en français, en anglais ou en pidgin.",
    },
    actions: ["Voir le billet reçu", "Acheter pour quelqu'un"],
  },
});
