import { rendu } from "@afrimove/domain";
import { ecran } from "../ecran";
import { billetTchoumi, departAlpha0830 } from "../partage/alpha0830";

const depart = departAlpha0830("en_vente");
const billet = billetTchoumi(depart, false);

/** Plan du bus : 4 rangées de 11 cases, 9 libres, le siège 24 attribué (3ᵉ rangée, 2ᵉ case). */
const RANGEES = ["pppppppplpp", "ppplppplppp", "pCplpplpplp", "pplpppplppl"];
const cases = RANGEES.join("")
  .split("")
  .map((c) => (c === "p" ? "pris" : c === "l" ? "libre" : "attribue"));

/** 19 · Vente en un écran : siège, voyageur, paiement, imprimer. Billet ALP-DLA-270105-0185. */
export const Vente = ecran({
  planche: "Vente",
  maintenant: "08:11",
  donnees: {
    titre: "Vendre",
    guichet: "Guichet 2 · billet n° ALP-DLA-270105-0185",
    departs: [
      { heure: "08:30", destination: "Yaoundé · 9 pl.", choisi: true },
      { heure: "09:00", destination: "Bafoussam · 28", choisi: false },
      { heure: "09:30", destination: "Yaoundé · 40", choisi: false },
      { libelle: "+ 11", choisi: false },
    ],
    siege: {
      numero: 24,
      libelle: "attribué automatiquement · touche un siège pour changer",
      libres: "9 libres",
    },
    voyageur: {
      nom: "Tchoumi Paul",
      telephone: "6 77 30 11 45",
      piece: "8820",
      options: ["Client connu ↓", "+ bagage 1 000"],
    },
    paiement: [
      { mode: "Cash", detail: "rendu : 1 000", choisi: true },
      { mode: "MoMo", detail: "push au client", choisi: false },
      { mode: "Orange Money", detail: "référence", choisi: false },
    ],
    caisse: { recu: 5000, billet: 4000, rendu: rendu(5000, 4000) },
    sms: "oui",
    action: {
      libelle: "Encaisser et imprimer",
      detail: "touche 3 · billet + SMS en 2 s",
      montant: 4000,
    },
  },
  visuel: { plan: { colonnes: 11, cases } },
  entites: { departs: [depart], billets: [billet] },
});
