import { ecran } from "../ecran";
import { DEPART_BETA_0800, PLAN_BETA_0800_AVANT_PAIEMENT } from "../monde";

const PRIS = [1, 2, 5, 9, 10, 14, 15];

/** 2 · Siège + paiement en un écran (touche 2 → 3). */
export const SiegePay = ecran({
  planche: "SiegePay",
  donnees: {
    compagnie: "Bêta Express · VIP",
    trajet: {
      origine: "Douala Akwa",
      destination: "Yaoundé Mvan",
      heure: "08:00",
      duree: "3 h 30",
    },
    pour: ["Pour moi", "Pour un proche", "À plusieurs"],
    pourActif: "Pour moi",
    plan: {
      titre: "Choisis ta place",
      legende: ["prise", "libre", "toi"],
      chauffeur: "chauffeur",
      sieges: Array.from({ length: 16 }, (_, i) => {
        const numero = i + 1;
        return { numero, etat: numero === 7 ? "choisi" : PRIS.includes(numero) ? "pris" : "libre" };
      }),
      choix: { numero: 7, description: "côté fenêtre · près de la porte" },
      libres: "9 places libres",
    },
    voyageur: { nom: "Aïcha Ngo", telephone: "6 91 22 10 08", modifier: "modifier" },
    moyens: ["MTN MoMo", "Orange Money", "Carte"],
    moyenChoisi: "MTN MoMo",
    recapitulatif: {
      billet: { libelle: "Billet Bêta Express VIP", montant: 7500 },
      frais: {
        libelle: "Frais de service AfriMove",
        offert: "(offerts avec JOURJ)",
        montantBarre: 250,
        montant: 0,
      },
    },
    action: {
      libelle: "Payer et recevoir le billet",
      detail: "touche 3 · confirmation MoMo sur ton téléphone",
      total: 7500,
    },
    garantie: "L'argent du billet va à Bêta Express. AfriMove ne le garde pas.",
  },
  entites: {
    departs: [DEPART_BETA_0800],
    plans: { [DEPART_BETA_0800.id]: PLAN_BETA_0800_AVANT_PAIEMENT },
  },
});
