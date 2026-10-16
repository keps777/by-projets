import { ecran } from "../ecran";
import { billetAichaAuQuai, billetTchoumi, departAlpha0830 } from "../partage/alpha0830";

const depart = departAlpha0830("embarquement");

/** 23 · Quai 3, départ de 08:30 vers Yaoundé : scan, comptage, soute, absents. */
export const Quai = ecran({
  planche: "Quai",
  maintenant: "08:25",
  donnees: {
    titre: "Quai 3 · 08:30 Yaoundé",
    equipage: "Bus LT 412 AB · chauffeur Mbarga · convoyeur Alain",
    mode: "scan",
    dernierScan: {
      libelle: "Dernier scan · OK · monte",
      heure: "08:19:42",
      voyageur: "Ngo Aïcha",
      siege: "siège 7",
      detail: "ALP-DLA-270105-0142 · CNI ···· 4471 · VIP · 1 bagage soute",
    },
    embarquement: {
      embarques: 31,
      capacite: 40,
      libelle: "embarqués",
      attendus: "9 attendus · 2 non présentés à 08:25",
      depart: "départ 08:30",
    },
    compteurs: [
      { libelle: "Soute", valeur: 14, sur: 17, detail: "3 colis à charger" },
      { libelle: "Refusés", valeur: 1, detail: "déjà scanné 07:58" },
      { libelle: "En route", valeur: 4, detail: "montent à Pouma" },
    ],
    absents: {
      titre: "Pas encore montés",
      aide: "appeler · 1 touche",
      liste: [
        {
          voyageur: "Tchoumi Paul",
          siege: "· siège 24",
          detail: "· vendu 08:12",
          action: "code 4 chiffres",
        },
        {
          voyageur: "Essomba R.",
          siege: "· siège 12",
          detail: "· en retard, prévenu",
          action: "libérer",
        },
      ],
    },
    actions: ["Vendre les 9 restantes", "Départ · liste au chauffeur"],
  },
  visuel: { progression: 78 },
  entites: {
    departs: [depart],
    billets: [billetAichaAuQuai(depart), billetTchoumi(depart, true)],
  },
});
