import { ecran } from "../ecran";
import { BILLET_AICHA, DEPART_BETA_0800 } from "../monde";

/**
 * 3 · Billet : QR et code à 4 chiffres. Le numéro est celui de Bêta Express (BEX-…) ; le quai, lui,
 * affiche ALP-… pour le même billet (voir INCOHERENCES.md).
 */
export const Pass = ecran({
  planche: "Pass",
  donnees: {
    statut: "Payé · billet envoyé par SMS",
    billet: {
      _billetId: BILLET_AICHA.id,
      compagnie: "Bêta Express",
      numero: "BEX-DLA-270105-0142",
      origine: { code: "DLA", gare: "Douala Akwa" },
      duree: "3 h 30",
      destination: { code: "YDE", gare: "Yaoundé Mvan" },
      depart: "08:00",
      date: "05.01",
      siege: 7,
      classe: "VIP",
    },
    codeSansScanner: {
      libelle: "Code sans scanner",
      code: "7341",
      voyageur: "Aïcha Ngo · CNI ··· 4471",
      consigne: "Au quai 20 min avant, avec ta pièce.",
    },
    suivre: { titre: "Suivre mon bus", detail: "et prévenir un proche" },
    moto: { titre: "Moto vers la gare", detail: "part à 07:10 · 700 F" },
    annulation: "Reporter ou annuler · gratuit jusqu'à 07:00",
    colis: "+ colis",
  },
  entites: { departs: [DEPART_BETA_0800], billets: [BILLET_AICHA] },
});
