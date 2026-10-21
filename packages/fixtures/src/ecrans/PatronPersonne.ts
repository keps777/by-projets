import { ecran } from "../ecran";
import { nombre } from "../format";
import { ESSONO, JOSEPH_M } from "../monde";
import { CAISSE_JOSEPH as K } from "../partage/caisse";

/** 30d · La fiche de Joseph M. vue par le patron : 90 jours de billets, 3 écarts négatifs en 10 jours. */
export const PatronPersonne = ecran({
  planche: "PatronPersonne",
  donnees: {
    titre: "Joseph M.",
    detail: "Guichetier · Akwa guichet 2 · depuis le 5 janv. 2027",
    badge: "3 ÉCARTS",
    fiche: {
      _personneId: JOSEPH_M.id,
      initiales: "JM",
      telephone: "6 77 •• •• 23 · MTN",
      salaire: "Salaire 95 000 · payé le 30 par MoMo",
      superviseur: `Superviseure : ${ESSONO.nom}`,
      etat: "en service",
      depuis: "depuis 05:30",
    },
    chiffres: [
      { libelle: "Billets", valeur: 1204, detail: "90 jours" },
      { libelle: "Colis", valeur: 312, detail: "0 litige" },
      { libelle: "Annul.", valeur: 9, detail: "0,7 % · normal" },
      { libelle: "Écarts", valeur: 3, detail: "10 jours · − 3 500" },
    ],
    ecarts: {
      titre: "Écart de caisse · 10 derniers jours",
      tolerance: "tolérance ± 500",
      jours: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      lecture:
        "Toujours en négatif, toujours en fin de journée, toujours un multiple de 500. Marie, même guichet le matin : 0 écart. Ce n'est pas le tiroir, c'est la monnaie rendue sur les derniers billets.",
    },
    journal: {
      titre: "Journal · 3 derniers écarts",
      aide: "validés Essono",
      lignes: [
        {
          quand: "15 déc. 14:00",
          detail: `· compté ${nombre(K.compte)} · attendu ${nombre(K.attendu)}`,
          ecart: K.evaluation.ecart,
        },
        {
          quand: "12 déc. 13:45",
          detail: "· compté 581 000 · attendu 582 500",
          ecart: -1500,
        },
        {
          quand: "8 déc. 14:10",
          detail: "· compté 612 500 · attendu 613 500",
          ecart: -1000,
        },
      ],
    },
    actions: [
      { titre: "Changer de guichet / gare", detail: "dès demain · superviseure prévenue" },
      { titre: "Demander un nouveau PIN", detail: "la superviseure l'envoie par SMS" },
    ],
    pied: {
      desactiver: { libelle: "Désactiver le compte", detail: "immédiat · tracé" },
      assistant: { libelle: "En parler à l'assistant", detail: "que faire avec Joseph ?" },
    },
  },
  visuel: {
    // 10 barres (jours 6 à 15) : les écarts du 8, du 12 et du 15 sont en ambre, de plus en plus hauts.
    ecartsParJour: { ambre: { 8: 60, 12: 80, 15: 100 } },
  },
});
