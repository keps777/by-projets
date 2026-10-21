import { ecran } from "../ecran";
import { TCHOUA } from "../monde";

/** 37b · Convention Alpha – Oméga : parts par tronçon (colis de 3 kg à 3 000 F), 5 règles, signatures, bilan du trimestre. */
export const InterAgencesConvention = ecran({
  planche: "InterAgencesConvention",
  donnees: {
    titre: "Convention Alpha – Oméga",
    detail: "Signée le 12 oct. 2026 · renouvelée chaque trimestre",
    badge: "ACTIVE",
    parts: {
      titre: "Tronçons et parts",
      aide: "colis · 3 kg type",
      entetes: ["tronçon", "Alpha", "Oméga"],
      lignes: [
        { troncon: "Douala → Bafoussam", alpha: 1400, omega: "—" },
        { troncon: "Bafoussam → Bamenda", alpha: "—", omega: 1200 },
        { troncon: "Transbordement à Bafoussam", alpha: 200, omega: 200 },
      ],
      total: {
        libelle: "Client paie 3 000 · AfriMove 150 (payé par l'émetteur)",
        alpha: 1600,
        omega: 1400,
      },
    },
    regles: {
      titre: "Les 5 règles",
      liste: [
        {
          titre: "1 · Responsabilité au scan.",
          texte:
            "Le colis est à celui dont le dernier scan est enregistré. Perte ou casse : il rembourse le client à la valeur déclarée (max 50 000).",
        },
        {
          titre: "2 · Règlement le lundi 08:00",
          texte:
            "par MoMo, solde net calculé par AfriMove sur les scans de la semaine. Contestation possible jusqu'au dimanche 20:00.",
        },
        {
          titre: "3 · Correspondance voyageurs :",
          texte:
            "25 min garanties · le second bus attend 15 min · au-delà, replacement gratuit sur le départ suivant, à la charge du retardataire.",
        },
        {
          titre: "4 · Un seul numéro",
          texte:
            "pour le client, un seul SMS par étape. Chacun voit le colis sur son écran, personne ne voit les ventes de l'autre.",
        },
        {
          titre: "5 · Sortie",
          texte: "à tout moment avec 30 jours de préavis · les colis en route vont au bout.",
        },
      ],
    },
    signatures: [
      { libelle: "Signé pour Alpha", detail: "Toi · PIN patron · 12 oct. 09:40" },
      {
        libelle: "Signé pour Oméga",
        detail: `${TCHOUA.nom} · PIN patron · 12 oct. 11:05`,
      },
    ],
    trimestre: [
      { libelle: "Trimestre", valeur: 184, detail: "colis échangés" },
      { libelle: "Litiges", valeur: 1, detail: "réglé en 2 jours" },
      { libelle: "Net reçu", valeur: "+ 131 k", detail: "12 lundis" },
    ],
    pied: "Texte complet (2 pages) et historique des règlements dans les exports du comptable.",
    actions: ["Historique · règlements", "Retour · entre compagnies"],
  },
});
