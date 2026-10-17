import { ecran } from "../ecran";
import { ALAIN_B, JOSEPH_M, MARIE_T, PAULINE_N } from "../monde";

/** 28d · L'équipe de la gare d'Akwa vue par Mme Essono : 9 personnes, un compte et un PIN chacune. */
export const SuperviseurEquipe = ecran({
  planche: "SuperviseurEquipe",
  maintenant: "14:02",
  donnees: {
    titre: "Équipe de la gare",
    detail: "Akwa · 9 personnes · un compte et un PIN chacun",
    ajouter: "+ personne",
    enService: {
      titre: "En service aujourd'hui",
      aide: "touche un nom",
      personnes: [
        {
          _personneId: JOSEPH_M.id,
          initiales: "JM",
          nom: "Joseph M. · guichetier · guichet 2",
          etat: "PIN à renouveler · 3 écarts en 10 jours",
          statut: "en service",
          choisi: true,
        },
        {
          _personneId: MARIE_T.id,
          initiales: "MT",
          nom: "Marie T. · guichetière · guichet 1",
          etat: "PIN OK · 5 annulations en 10 jours",
          statut: "en service",
        },
        {
          _personneId: ALAIN_B.id,
          initiales: "AB",
          nom: "Alain B. · convoyeur · LT 412 AB",
          etat: "PIN OK · en route vers Yaoundé",
          statut: "à bord",
        },
        {
          _personneId: PAULINE_N.id,
          initiales: "PN",
          nom: "Pauline N. · guichetière · guichet 3",
          etat: "bloquée · 3 PIN faux à 09:40",
          statut: "bloquée",
        },
      ],
      autres: "+ 5 autres (2 convoyeurs, 2 chauffeurs, 1 guichetier de nuit)",
    },
    fiche: {
      nom: "Joseph M.",
      detail: "guichetier depuis le 5 janv. · 1 204 billets",
      actions: [
        { titre: "Renouveler le PIN", detail: "PIN provisoire par SMS, à changer", choisi: true },
        { titre: "Changer de guichet", detail: "ou de rôle" },
        { titre: "Voir son journal", detail: "ventes, annulations, écarts" },
        { titre: "Désactiver le compte", detail: "immédiat · patron prévenu" },
      ],
      autres: ["Débloquer Pauline N.", "Mon propre PIN · changer"],
      regle:
        "Un PIN n'est jamais affiché, même au superviseur. Le renouvellement envoie un PIN provisoire par SMS, valable 1 h, que la personne remplace à sa première connexion. Chaque action ici est signée par ton PIN et visible par le patron.",
    },
    pied: {
      annuler: "Annuler",
      renouveler: { libelle: "Renouveler · mon PIN", detail: "SMS provisoire à Joseph · tracé" },
    },
  },
});
