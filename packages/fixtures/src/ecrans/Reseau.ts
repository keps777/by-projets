import { ecran } from "../ecran";

/** 5 · Le réseau en direct : toutes les compagnies, les lignes et leur prochain départ. */
export const Reseau = ecran({
  planche: "Reseau",
  maintenant: "07:40",
  donnees: {
    titre: "Le réseau en direct",
    resume: "5 compagnies · 38 bus en route · 14 départs à venir",
    heure: "07:40",
    filtres: ["Toutes", "Bêta", "Alpha", "Oméga", "VIP", "Nuit"],
    filtreActif: "Toutes",
    carte: {
      villes: ["Douala", "Yaoundé", "Bafoussam", "Bamenda", "Kribi", "Ngaoundéré"],
      legende: "● Bêta ● Alpha ● Oméga",
    },
    lignes: {
      titre: "Lignes · prochain départ",
      aide: "touche une ligne",
      liste: [
        {
          trajet: "Douala → Yaoundé",
          detail: "3 compagnies · 08:00 Bêta VIP · 08:30 Alpha · 09:30 Oméga",
          prixDes: 3800,
        },
        {
          trajet: "Douala → Bafoussam",
          detail: "2 compagnies · 08:15 Alpha · 10:00 Oméga",
          prixDes: 3500,
        },
        {
          trajet: "Yaoundé → Bamenda",
          via: "via Bafoussam",
          detail: "correspondance 25 min · un seul billet",
          prixDes: 7000,
        },
        {
          trajet: "Douala → Kribi",
          mode: "covoiturage",
          detail: "aucun bus avant 14 h · 2 voitures partent ce matin",
          prix: 4000,
        },
      ],
    },
  },
});
