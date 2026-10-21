import { repartitionRelais } from "@afrimove/domain";
import { ecran } from "../ecran";

const { voyageur: supplement } = repartitionRelais();

/** 15 · Points relais à Bafoussam : trois commerçants près de chez Maman. */
export const Relais = ecran({
  planche: "Relais",
  donnees: {
    carte: ["Marché A", "1", "2", "3", "Chez Maman", "Gare Alpha"],
    titre: "Points relais · Bafoussam",
    sousTitre: "3 commerçants près de chez elle",
    relais: [
      {
        rang: 1,
        nom: "Boutique Mama Fotso",
        etat: "· ouvert",
        detail: "350 m de chez Maman · 7 h–20 h · lun.–sam. · 4,9 ★ · 212 colis remis",
        supplement,
      },
      {
        rang: 2,
        nom: "Pharmacie du Marché",
        etat: "· ouvert",
        detail: "900 m · 7 h 30–22 h · 7 j/7 · 4,8 ★ · frigo pour médicaments",
        supplement,
      },
      {
        rang: 3,
        nom: "Call-box Tonton Paul",
        etat: "· ferme à 19 h",
        detail: "1,2 km · 6 h–19 h · 4,6 ★ · petit colis seulement",
        supplement,
      },
    ],
    devenir: {
      titre: "Ta boutique ici ? Deviens point de relais · 200 F par colis",
      detail:
        "Le relais scanne à la réception et à la remise · code + pièce · 7 jours de garde inclus",
    },
    action: { libelle: "Choisir Mama Fotso · prévenir Maman", montant: supplement },
  },
});
