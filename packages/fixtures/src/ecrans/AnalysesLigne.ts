import { ecran } from "../ecran";
import { LIGNES_ANALYSEES, RECETTE_PAR_JOUR, SEMAINE } from "../partage/analyses";
import { DEPARTS_DLA_BAF, TOUS_DEPARTS_DLA_BAF } from "../partage/ligneDlaBaf";

const ligne = LIGNES_ANALYSEES[1]!;

/** 32b · Analyses, une ligne en détail : Douala → Bafoussam, 5 départs par jour, 78 % de remplissage. */
export const AnalysesLigne = ecran({
  planche: "AnalysesLigne",
  donnees: {
    titre: ligne.nom,
    periode: `${SEMAINE.libelle} · 5 départs par jour`,
    periodes: ["Semaine", "Mois", "Trimestre"],
    chiffres: [
      { libelle: "Recette", valeur: ligne.recette, detail: "− 14 %" },
      { libelle: "Billets", valeur: 2104, detail: "35 départs" },
      { libelle: "Rempl.", valeur: `${ligne.remplissage} %`, detail: "cible 85" },
      { libelle: "Colis", valeur: 612, detail: "+ 9 %" },
    ],
    departs: {
      titre: "Par départ · remplissage moyen",
      aide: "touche pour modifier",
      liste: [
        {
          _departId: DEPARTS_DLA_BAF.d0600.id,
          heure: "06:00",
          detail: "classique · 3 500 · LT 118 AB",
          remplissage: 94,
        },
        {
          _departId: DEPARTS_DLA_BAF.d0815.id,
          heure: "08:15",
          detail: "classique · 3 500 · soute colis",
          remplissage: 88,
        },
        {
          _departId: DEPARTS_DLA_BAF.d1000.id,
          heure: "10:00",
          detail: "classique · 3 500 ·",
          concurrent: "Oméga 09:30 à 3 000",
          remplissage: 55,
        },
        {
          _departId: DEPARTS_DLA_BAF.d1300.id,
          heure: "13:00",
          detail: "classique · 3 500",
          remplissage: 76,
        },
        {
          _departId: DEPARTS_DLA_BAF.d1630.id,
          heure: "16:30",
          detail: "VIP · 5 000 · clim",
          remplissage: 81,
        },
      ],
    },
    parJour: {
      titre: "Par jour de la semaine",
      jours: RECETTE_PAR_JOUR.initiales,
      lecture:
        "Le mardi monte, le mercredi s'effondre : le marché a changé de jour. Les commerçantes montent le mardi soir.",
    },
    canaux: [
      { libelle: "Vendus en ligne", valeur: "11 %", detail: "· 231 billets · + 3 pts" },
      {
        libelle: "En route (Bafang, Mbouda)",
        valeur: "96 billets",
        detail: "· tous enregistrés",
      },
    ],
    actions: ["Pourquoi ça baisse ?", "Modifier la ligne"],
  },
  visuel: {
    // Hauteur des barres par jour (L à D) : le mercredi s'effondre (rouge), le mardi monte (vert).
    parJourPx: [72, 88, 40, 66, 92, 100, 70],
    remplissageParDepart: { 94: "vert", 88: "vert", 55: "rouge", 76: "ambre", 81: "vert" },
  },
  entites: { departs: TOUS_DEPARTS_DLA_BAF },
});
