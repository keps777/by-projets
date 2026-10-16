import { ecran } from "../ecran";
import { partageCadence } from "../partage/cadence";

const { depart } = partageCadence;

/** La planche « Cadence » affiche ce billet avec un nom (« Ngono A. ») que le quai dit manquer. */
const billet0231 = {
  ...partageCadence.billet0231,
  passager: { nom: "Ngono A." },
};

/** 20 · Mode cadence (5 h) : une file de 40, un billet à chaque touche. */
export const Cadence = ecran({
  planche: "Cadence",
  maintenant: "05:14",
  donnees: {
    quitter: "Quitter la cadence",
    horloge: "CADENCE · 05:14",
    depart: {
      libelle: "Départ en cours",
      valeur: "05:30 Yaoundé",
      restantes: 17,
      detail: "places restantes",
    },
    dernierBillet: {
      libelle: "Dernier billet · 17 s",
      detail: "0231 · siège 18 · Ngono A.",
    },
    prochain: { libelle: "Prochain", prix: 4000 },
    siegeSuivant: {
      libelle: "Siège suivant :",
      numero: 19,
      detail: "· nom et pièce saisis au quai par le convoyeur",
    },
    paiements: [
      { mode: "CASH", detail: ["touche 1 · imprime", "+ SMS si numéro"] },
      { mode: "MOMO", detail: ["touche 1 · push", "touche 2 · confirmé"] },
    ],
    options: ["× 2 places", "+ numéro", "Autre départ"],
    pied: {
      libelle: "Vendus en cadence :",
      vendus: 63,
      annulations: "· 0 annulation",
      synchro: "hors ligne OK · sync 05:13",
    },
  },
  entites: { departs: [depart], billets: [billet0231] },
});
