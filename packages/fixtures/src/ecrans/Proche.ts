import { devisBillet } from "@afrimove/domain";
import { ecran } from "../ecran";

const devis = devisBillet(5500, true);

/** 17 · Payer le voyage d'un proche depuis l'étranger : Maman, Bafoussam → Douala samedi. */
export const Proche = ecran({
  planche: "Proche",
  donnees: {
    titre: "Payer pour un proche",
    sousTitre: "Depuis Montréal, Paris ou Douala · il reçoit le billet par SMS",
    proches: [
      { initiales: "MA", nom: "Maman", choisi: true },
      { initiales: "PK", nom: "Paul", choisi: false },
      { nom: "+ Nouveau numéro", choisi: false },
    ],
    destinataire: { nom: "Maman · Thérèse Ngo", telephone: "+237 6 99 40 18 22" },
    trajet: { depart: "Bafoussam", arrivee: "Douala", jour: "sam. 10 janv." },
    departs: {
      titre: "Départs samedi",
      sousTitre: "elle choisit son siège au quai, ou toi ici",
      options: [
        {
          heure: "07:30",
          compagnie: "Alpha Voyages",
          classe: "VIP · clim",
          detail: "14 places · siège 3 côté fenêtre choisi",
          prix: 5500,
          choisi: true,
        },
        {
          heure: "10:00",
          compagnie: "Oméga Transports",
          classe: "classique",
          detail: "22 places",
          prix: 3500,
          choisi: false,
        },
      ],
    },
    paiement: {
      libelle: "Tu paies par carte · CAD",
      carte: "Visa ···· 4471",
      detail: "5 500 F + 250 F de frais",
      equivalent: "≈ 12,90 $ CA",
      alerte: "Me prévenir quand elle monte et quand elle arrive",
    },
    action: {
      libelle: "Payer · Maman reçoit son billet",
      detail: "touche 3 · SMS avec QR et code 4 chiffres",
      total: devis.total,
    },
    pied: "Elle n'a besoin ni de smartphone ni d'internet : le SMS suffit au quai.",
  },
});
