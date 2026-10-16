import { ecran } from "../ecran";

/** 10 · Groupe : 6 voyageurs côte à côte, bus entier, cagnotte entre amis. */
export const Groupe = ecran({
  planche: "Groupe",
  donnees: {
    titre: "À plusieurs",
    sousTitre: "Places côte à côte, bus entier, cagnotte entre amis",
    modes: ["Groupe · 2 à 12", "Bus entier", "Cagnotte"],
    modeActif: "Groupe · 2 à 12",
    depart: { trajet: "Douala → Bafoussam · sam. 10 janv.", compagnie: "07:30 Alpha" },
    voyageurs: { nombre: 6, libelle: "voyageurs · 6 places côte à côte" },
    sieges: [11, 12, 13, 15, 16, 17],
    reservation:
      "Sièges 11 à 17 réservés ensemble, 15 min pour payer. Les billets partent à chaque numéro.",
    cagnotte: {
      titre: "Qui paie quoi",
      voyageurs: 6,
      prixPlace: 3500,
      total: 21000,
      participants: [
        { initiales: "AN", nom: "Aïcha · moi", statut: "payé" },
        { initiales: "PK", nom: "Paul K. · 6 77 …", statut: "payé" },
        { initiales: "+4", nom: "Marthe, Jo, Éric, Nadia", statut: "lien envoyé" },
      ],
    },
    actions: ["Partager sur WhatsApp", "Louer un bus de 30 · devis"],
    paiement: {
      libelle: "Payer ma part",
      part: 3500,
      detail: "ou tout payer pour le groupe",
      total: 21000,
    },
  },
});
