import { ecran } from "../ecran";
import { BUS_LT412, MME_FOUDA } from "../monde";
import { departAlpha0830 } from "../partage/alpha0830";

/** 26 · Contrôleur inopiné : Mme Fouda compte les têtes du LT 412 AB à Edéa et trouve un siège sans billet. */
export const Controleur = ecran({
  planche: "Controleur",
  maintenant: "09:14",
  donnees: {
    titre: "Contrôle à bord",
    detail: `${MME_FOUDA.nom} · contrôleuse Alpha · bus ${BUS_LT412.immatriculation} à Edéa`,
    badge: "INOPINÉ",
    compteurs: [
      { libelle: "Liste", valeur: 35, detail: "billets valides" },
      { libelle: "Comptés", valeur: 36, detail: "têtes à bord" },
      { libelle: "Écart", valeur: "+1", detail: "sans billet" },
    ],
    sieges: {
      titre: "Siège par siège · touche un siège pour vérifier",
      total: "36 sièges",
      legende: ["billet scanné", "occupé sans billet", "libre"],
    },
    sansBillet: {
      titre: "Siège 7 · voyageur sans billet",
      lieuHeure: "Edéa · 09:14",
      explication:
        "Il dit avoir payé 4 000 F au convoyeur à Douala. Aucune vente en route n'est enregistrée pour ce siège.",
      actions: ["Régulariser · billet 4 000", "Signaler le convoyeur"],
    },
    cloture: "Clore le contrôle · envoyer au patron",
  },
  visuel: {
    // 36 sièges : le 7 est rouge (occupé sans billet), le 23 est libre, les autres sont scannés.
    sieges: {
      total: 36,
      sansBillet: [7],
      libres: [23],
      numerosAffiches: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    },
  },
  entites: { departs: [departAlpha0830("parti")] },
});
