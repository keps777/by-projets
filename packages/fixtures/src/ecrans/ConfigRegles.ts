import { REGLES_PAR_DEFAUT } from "@afrimove/domain";
import { ecran } from "../ecran";

/**
 * 34e · Les règles de l'agence : annulation (gratuite 1 h avant, puis VIP 20 %, classique 10 %),
 * tolérance d'écart 1 000 F, comptes MoMo. Le domaine garde des valeurs provisoires différentes pour
 * la retenue (VIP 50 %, classique 25 %) : voir INCOHERENCES.md.
 */
export const ConfigRegles = ecran({
  planche: "ConfigRegles",
  donnees: {
    titre: "Règles de l’agence",
    detail: "S’appliquent à toutes les gares · signées par ton PIN",
    badge: "3 GARES",
    annulation: {
      titre: "Annulation par le voyageur",
      gratuite: {
        libelle: "Gratuite jusqu’à",
        choix: ["1 h avant le départ", "2 h avant", "la veille 20:00", "jamais"],
        valeur: "1 h avant le départ",
      },
      retenue: {
        libelle: "Ensuite · retenue",
        choix: [
          "selon la classe (VIP 20 %, classique 10 %)",
          "10 % partout",
          "50 % partout",
          "pas de remboursement",
        ],
        valeur: "selon la classe (VIP 20 %, classique 10 %)",
      },
      note: "Le remboursement part sur le même MoMo, le siège se libère tout de suite. Au guichet, après le délai, seul le superviseur peut annuler avec son PIN.",
    },
    caisse: {
      titre: "Caisse",
      tolerance: { libelle: "Tolérance d’écart", valeur: "1 000" },
      audela: {
        libelle: "Au-delà",
        choix: [
          "PIN superviseur + patron prévenu",
          "PIN superviseur seulement",
          "bloque le guichet",
        ],
        valeur: "PIN superviseur + patron prévenu",
      },
    },
    momo: {
      titre: "Comptes MoMo de l’agence",
      mtn: { libelle: "MTN MoMo · marchand", valeur: "6 77 •• •• 02" },
      orange: { libelle: "Orange Money · marchand", valeur: "6 99 •• •• 77" },
      note: "Changer un compte exige ton PIN et un SMS de confirmation à l’ancien numéro. Les ventes en cours restent sur l’ancien compte jusqu’à minuit.",
    },
    historique: "Chaque règle garde son historique : qui, quand, ancienne et nouvelle valeur.",
    actions: {
      annuler: "Annuler",
      enregistrer: {
        libelle: "Enregistrer · mon PIN",
        detail: "appliqué dès maintenant · 3 gares",
      },
    },
    _reglesDomaine: REGLES_PAR_DEFAUT,
  },
});
