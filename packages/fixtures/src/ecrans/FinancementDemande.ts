import { ecran } from "../ecran";

/** 36b · Dossier d'avance de 6 M envoyé à 10:04 (n° AV-2027-0041), en cours d'analyse par le partenaire. */
export const FinancementDemande = ecran({
  planche: "FinancementDemande",
  maintenant: "10:05",
  donnees: {
    titre: "Dossier envoyé",
    detail: "Avance 6 M · [établissement financier partenaire] · n° AV-2027-0041",
    badge: "EN COURS",
    demande: {
      montant: 6_000_000,
      libelle: "FCFA · réponse sous 24 h",
      conditions: [
        { libelle: "remboursé par", valeur: "8 % des ventes MoMo" },
        { libelle: "durée estimée", valeur: "≈ 7 semaines" },
        { libelle: "coût total", valeur: "[x %] · partenaire" },
      ],
    },
    pieces: {
      titre: "Pièces jointes · automatiques",
      aide: "rien à scanner",
      liste: [
        {
          nom: "90 jours de ventes certifiées AfriMove",
          detail: "36,2 M · 8 940 billets · 2 310 colis",
          format: "pdf",
        },
        {
          nom: "Relevés MoMo rapprochés · 3 mois",
          detail: "99,8 % de correspondance",
          format: "csv",
        },
        {
          nom: "Registre de commerce · carte contribuable",
          detail: "fournis à l'inscription · valides",
          format: "pdf",
        },
        {
          nom: "Mandat de prélèvement 8 % · signé PIN",
          detail: "sur le compte marchand MoMo · révocable à solde zéro",
          format: "pdf",
        },
      ],
    },
    suivi: {
      titre: "Suivi",
      etapes: [
        { etape: "Envoyé", detail: "· aujourd'hui 10:04 · accusé reçu du partenaire" },
        { etape: "Analyse", detail: "· le partenaire décide seul · jusqu'à demain 10:04" },
        {
          detail:
            "Versement sur ton compte · SMS + notification · le 8 % démarre au 1er billet MoMo suivant",
        },
      ],
    },
    mention:
      "AfriMove ne prête pas et ne touche pas l'argent : il présente ton dossier et exécute le prélèvement convenu. Tu peux retirer la demande tant qu'elle n'est pas versée.",
    actions: {
      retirer: "Retirer la demande",
      retour: { libelle: "Retour au tableau de bord", detail: "je te préviens dès la réponse" },
    },
  },
});
