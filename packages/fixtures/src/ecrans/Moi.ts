import { ecran } from "../ecran";
import { BILLET_AICHA, DEPART_BETA_0800 } from "../monde";

/** 12 · Moi : fidélité, parrainage, proches, historique des voyages et des colis. */
export const Moi = ecran({
  planche: "Moi",
  donnees: {
    profil: {
      initiales: "AN",
      nom: "Aïcha Ngo",
      detail: "+237 6 91 22 10 08 · CNI vérifiée · depuis janv. 2027",
    },
    fidelite: {
      libelle: "Fidélité",
      points: 1250,
      equivalence: "= 1 250 F sur ton prochain billet",
    },
    parrainage: { libelle: "Parrainage · AMI", amis: 3, detail: "250 F pour toi, 250 F pour eux" },
    proches: {
      titre: "Mes proches · 1 touche pour acheter",
      ajouter: "+ ajouter",
      liste: [
        {
          initiales: "MA",
          nom: "Maman · Bafoussam",
          detail: "6 99 … · prévenue à chaque arrivée",
          action: "Lui payer un billet",
        },
        {
          initiales: "KK",
          nom: "Kevin · Montréal",
          detail: "paie mes voyages par carte",
          action: "lui demander",
        },
      ],
    },
    historique: {
      titre: "Mes voyages et colis",
      sousTitre: "tout l'historique",
      elements: [
        {
          _billetId: BILLET_AICHA.id,
          titre: "Douala → Yaoundé · mar. 5 janv. · 08:00",
          detail: "Bêta Express VIP · siège 7 · 7 500 F",
          statut: "à venir",
        },
        {
          titre: "Colis pour Maman · Bafoussam",
          detail: "C-ALP-DLA-270103-0017 · 2 kg · 1 500 F",
          statut: "à retirer",
        },
        {
          titre: "Yaoundé → Douala · 28 déc.",
          detail: "Alpha · 4 000 F · reçu disponible",
          statut: "voyagé",
        },
      ],
    },
    devenir: [
      { titre: "Une boutique ? Deviens point de relais", detail: "200 F par colis remis · 3 min" },
      { titre: "Une moto ? Deviens livreur", detail: "700 F la course · tu choisis tes heures" },
    ],
    pied: ["Langue · FR", "Mes reçus", "Aide · WhatsApp"],
  },
  entites: { departs: [DEPART_BETA_0800], billets: [BILLET_AICHA] },
});
