import { ecran } from "../ecran";

/** 36 · Financement : avance sur recettes de 6 M (éligible jusqu'à 12 M), crédit matériel, paie, billet en 2 fois. */
export const Financement = ecran({
  planche: "Financement",
  donnees: {
    titre: "Financement",
    sousTitre:
      "Avec [établissement financier partenaire] · tes 90 jours de ventes font ton dossier",
    avance: {
      titre: "Avance sur recettes",
      statut: "éligible",
      plafond: "jusqu'à 12 M",
      equivalence: "= 10 jours de ventes",
      montant: { libelle: "Montant", valeur: "6 M" },
      conditions: [
        { libelle: "remboursé par", valeur: "8 % des ventes MoMo" },
        { libelle: "durée estimée", valeur: "≈ 7 semaines" },
        { libelle: "coût total", valeur: "[x %]", detail: "· fixé par le partenaire" },
      ],
      garantie:
        "Versé sur ton compte en 24 h. Pas de garantie : ton historique de ventes AfriMove est la garantie. AfriMove ne prête pas, il présente ton dossier.",
    },
    autres: [
      {
        titre: "Crédit matériel",
        detail: "2 téléphones + imprimante pour la nouvelle gare",
        conditions: "1,1 M · 12 × 100 000 · retenu sur les ventes",
      },
      {
        titre: "Paie des équipages",
        detail: "23 salaires versés par MoMo le vendredi",
        conditions: "calculés sur les trajets et les primes · 1 touche",
      },
    ],
    voyageurs: {
      titre: "Pour les voyageurs · payer en 2 fois",
      aide: "option par agence",
      exemple: {
        billetVip: 7500,
        reservation: 4000,
        veille: 3500,
        texte:
          "Billet VIP 7 500 : 4 000 à la réservation, 3 500 la veille. Le siège est bloqué, le billet part au 2e paiement.",
      },
    },
    action: {
      libelle: "Demander 6 M · dossier envoyé en 1 touche",
      reserve: "Module masqué tant que la convention avec le partenaire n'est pas signée.",
    },
  },
  visuel: { paiementEnDeuxFois: false, curseurMontant: "6 M" },
});
