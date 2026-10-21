import { ecran } from "../ecran";
import { SAMUEL_E } from "../monde";

/** 40 · Conducteur covoiturage : Samuel E. publie Douala → Kribi, samedi 08:30, 2 places à 4 000 F. */
export const Conducteur = ecran({
  planche: "Conducteur",
  donnees: {
    titre: "Proposer mon trajet",
    conducteur: `${SAMUEL_E.nom} · vérifié · Toyota Corolla · LT 882 CE`,
    badge: "VÉRIFIÉ",
    trajet: { depart: "Douala", arrivee: "Kribi", quand: "sam. · 08:30" },
    champs: {
      depart: { libelle: "Point de départ", valeur: "Bonapriso, pharmacie" },
      arrivee: { libelle: "Arrivée", valeur: "Kribi centre" },
    },
    places: { libelle: "Places", choix: [1, 2, 3], choisi: 2 },
    prix: { libelle: "Prix / place", valeur: 4000 },
    conseil:
      "Prix conseillé 3 500 à 4 500 (carburant partagé). Pas de bénéfice : du partage de frais.",
    options: [
      { libelle: "Clim ✓", actif: true },
      { libelle: "Bagage moyen ✓", actif: true },
      { libelle: "Femmes seulement", actif: false },
      { libelle: "Trajet régulier · chaque sam.", actif: false },
    ],
    reputation: {
      titre: "Tes 112 trajets · 4,9 ★",
      detail: "pièce, permis, carte grise vérifiés",
      paiement:
        "Tu reçois le paiement à l'arrivée, par MoMo, quand le passager confirme ou 2 h après l'heure prévue. AfriMove garde 250 F par place.",
    },
    action: {
      libelle: "Publier le trajet",
      detail: "touche 2 · visible dans l'app voyageur en 10 s",
      total: "2 × 4 000",
    },
  },
});
