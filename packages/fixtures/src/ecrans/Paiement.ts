import { ecran } from "../ecran";

/** 7 · Paiement générique : MoMo, Orange Money, carte, un proche. Ici le covoiturage de Samuel. */
export const Paiement = ecran({
  planche: "Paiement",
  donnees: {
    titre: "Paiement",
    commande: "Covoiturage Samuel · Douala → Kribi · 08:30",
    aPayer: { libelle: "À payer", montant: 4250 },
    detail: [
      { libelle: "Trajet · 1 place", montant: 4000 },
      { libelle: "Frais de service AfriMove", montant: 250 },
    ],
    question: "Avec quoi ?",
    moyens: [
      {
        sigle: "MTN",
        nom: "MTN Mobile Money",
        detail: "6 91 22 10 08 · tu confirmes sur ton téléphone",
        choisi: true,
      },
      {
        sigle: "OM",
        nom: "Orange Money",
        detail: "code #150# ou confirmation dans l'app Orange",
        choisi: false,
      },
      {
        nom: "Carte bancaire",
        detail: "Visa, Mastercard · aussi depuis l'étranger",
        choisi: false,
      },
      {
        nom: "Demander à un proche de payer",
        detail: "il reçoit un lien, tu reçois le billet",
        choisi: false,
      },
    ],
    garantie:
      "Paiement traité par un établissement agréé. Le prix du trajet va au conducteur à l'arrivée ; seuls les frais vont à AfriMove.",
    action: {
      libelle: "Payer",
      total: 4250,
      detail: "confirmation MoMo · billet par SMS en 10 s",
    },
  },
});
