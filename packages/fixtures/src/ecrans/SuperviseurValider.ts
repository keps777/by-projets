import { BLOCAGE_PIN_MINUTES, ESSAIS_PIN_MAX } from "@afrimove/domain";
import { ecran } from "../ecran";
import { ESSONO, SESSION_JOSEPH } from "../monde";
import { CAISSE_JOSEPH as K } from "../partage/caisse";

/** 28b · Valider la clôture du guichet 2 avec le PIN de Mme Essono : 694 500 comptés pour 695 500 attendus. */
export const SuperviseurValider = ecran({
  planche: "SuperviseurValider",
  maintenant: "14:02",
  donnees: {
    titre: "Valider la clôture",
    detail: `Guichet 2 · Joseph M. · ${K.numero} · 13:58`,
    badge: "PIN",
    bilan: [
      { libelle: "Attendu", montant: K.attendu },
      { libelle: "Compté", montant: K.compte },
      { libelle: "Écart", montant: K.evaluation.ecart },
    ],
    session: {
      _sessionId: SESSION_JOSEPH.id,
      resume: "184 billets cash · 41 colis · 2 annulations validées",
      periode: "05:02 → 13:58",
    },
    controles: [
      {
        libelle: "Tolérance de l'agence",
        valeur: K.tolerance,
        etat: "dans la limite",
      },
      { libelle: "Joseph · 10 derniers jours", valeur: "3 écarts négatifs · − 4 500" },
      { libelle: "Billets de cadence sans numéro aujourd'hui", valeur: 11 },
    ],
    commentaire: {
      libelle: "Commentaire du superviseur (visible par le patron)",
      valeur: "Recompté avec Joseph, écart confirmé, retenu sur sa prime",
    },
    pin: {
      titre: `Mon PIN · ${ESSONO.nom}`,
      aide: "6 chiffres · jamais partagé",
      touches: ["Utiliser mon empreinte", "Effacer"],
      regle: `${ESSAIS_PIN_MAX} essais, puis blocage ${BLOCAGE_PIN_MINUTES} min et alerte au patron. Le PIN valide, horodaté et signé, part dans le rapport de 21 h.`,
    },
    actions: {
      refuser: "Refuser · recompter",
      valider: { libelle: "Valider · écart − 1 000", detail: "signé Essono · caisse fermée" },
    },
  },
  visuel: { chiffresPin: 6, statutEcart: K.evaluation.statut },
  entites: { sessions: [SESSION_JOSEPH] },
});
