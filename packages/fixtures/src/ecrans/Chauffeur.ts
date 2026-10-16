import { ecran } from "../ecran";
import { departAlpha0830 } from "../partage/alpha0830";

/** 25 · Chauffeur Mbarga : feuille de route du 5 janvier, dépenses, incidents, semaine. */
export const Chauffeur = ecran({
  planche: "Chauffeur",
  maintenant: "09:51",
  donnees: {
    titre: "Chauffeur · Mbarga",
    feuille: "LT 412 AB · feuille de route du 5 janv.",
    gps: "GPS",
    trajet: {
      libelle: "Trajet en cours",
      trajet: "Douala → Yaoundé",
      detail: "parti 08:34 · 33 à bord · 14 colis · prochain arrêt Pouma 10:05",
      vitesse: 84,
      limite: "km/h · limite 90",
    },
    depenses: {
      titre: "Dépenses du trajet · justificatif photo",
      sousTitre: "remboursées au rapport",
      lignes: [
        { libelle: "Carburant · Total Edéa", montant: 45000, justificatif: "photo ✓" },
        { libelle: "Péage · 2 postes", montant: 1000, justificatif: "photo ✓" },
        { libelle: "Autre (parking, réparation…)", montant: "—", action: "+ ajouter" },
      ],
    },
    incidents: [
      { titre: "Incident · panne", detail: "1 touche · gare + voyageurs prévenus" },
      { titre: "Retard · 20 min", detail: "SMS automatique aux 33" },
    ],
    semaine: {
      titre: "Ma semaine",
      sousTitre: "paie le vendredi par MoMo",
      stats: [
        { valeur: 9, libelle: "trajets" },
        { valeur: 2310, libelle: "km" },
        { valeur: 0, libelle: "excès vitesse" },
        { valeur: "81 k", libelle: "à recevoir" },
      ],
    },
    action: "Arrivé à Pouma · ouvrir les portes",
  },
  entites: { departs: [departAlpha0830("parti")] },
});
