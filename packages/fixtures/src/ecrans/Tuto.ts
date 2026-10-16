import { ecran } from "../ecran";

/** 0c · Tutoriel en 3 écrans : tout en 3 touches. */
export const Tuto = ecran({
  planche: "Tuto",
  donnees: {
    etape: "Tutoriel · 1 / 3 · tout en 3 touches",
    passer: "Passer",
    touches: {
      un: { heure: "08:00", compagnie: "Bêta Express VIP", places: "9 places" },
      deux: { libelle: "choisis ta place" },
      trois: { libelle: "Payer · MoMo" },
    },
    titre: { ligne1: "Ton billet,", ligne2: "ton nom, ta place." },
    explication:
      "Un départ, un siège, un paiement : ton billet arrive par SMS avec un QR code et un code à 4 chiffres. Au quai, on te scanne et tu montes.",
    suite: [
      {
        rang: "2 / 3",
        titre: "Ton colis suivi jusqu'au bout",
        detail: "photo, code de retrait, livraison",
      },
      {
        rang: "3 / 3",
        titre: "Tes proches savent quand tu arrives",
        detail: "bus en direct, SMS automatique",
      },
    ],
    suivant: "Suivant",
  },
});
