import { ecran } from "../ecran";
import { departAlpha0830 } from "../partage/alpha0830";

/** 24 · Convoyeur Alain : vente en route à bord du LT 412 AB, hors ligne, entre Douala et Yaoundé. */
export const Convoyeur = ecran({
  planche: "Convoyeur",
  maintenant: "09:51",
  donnees: {
    titre: "Convoyeur · Alain",
    trajet: "Bus LT 412 AB · Douala → Yaoundé · parti 08:34",
    reseau: "HORS LIGNE",
    compteurs: [
      { libelle: "À bord", valeur: 33, detail: "scannés" },
      { libelle: "Libres", valeur: 7, detail: "4 réservées Pouma" },
      { libelle: "En route", valeur: 2, detail: "vendus · 9 000" },
    ],
    vente: {
      titre: "Vente en route · touche 1",
      trajet: "Pouma → Yaoundé",
      places: 1,
      unite: "place",
      siege: "siège 36 · prix prorata fixé par l'agence",
      voyageurLibelle: "Nom · téléphone (facultatif, pour le SMS)",
      voyageur: "Mballa J. · 6 55 …",
      cash: { mode: "CASH", montant: 4500, detail: "touche 2 · billet par SMS" },
      momo: { mode: "MOMO", detail: "push · confirmé à bord" },
      note: "Numéroté hors ligne dans ma plage (ALP-DLA-270105-3xxx). Le patron voit chaque vente en route ce soir, avec l'heure et le lieu GPS.",
    },
    actions: ["Scanner à Pouma", "Colis à décharger · 6", "Incident · panne"],
    pied: {
      liste: "Liste nominative : 33 à bord · 1 contrôle possible à tout moment",
      action: "montrer",
    },
  },
  entites: { departs: [departAlpha0830("parti")] },
});
