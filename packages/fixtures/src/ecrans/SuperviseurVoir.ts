import { decisionAnnulation } from "@afrimove/domain";
import { ecran } from "../ecran";
import { heure } from "../horloge";
import { ESSONO, MARIE_T } from "../monde";
import { BILLET_0171, DEPART_ALPHA_1430 } from "../partage/caisse";

/**
 * Ce que le domaine dirait de cette annulation à 14:02 avec les règles par défaut : le départ est à
 * 14:30, soit moins d'une heure avant, donc une retenue. La planche écrit « plus de 1 h avant le
 * départ · remboursement intégral » (voir INCOHERENCES.md).
 */
const decisionDomaine = decisionAnnulation({
  etat: BILLET_0171.etat,
  prix: BILLET_0171.prix,
  classe: BILLET_0171.classe,
  heureDepart: DEPART_ALPHA_1430.heureDepart,
  maintenant: heure("14:02"),
});

/** 28c · Demande d'annulation du billet 0171 (4 000 F, « client parti ») : Mme Essono décide avec son PIN. */
export const SuperviseurVoir = ecran({
  planche: "SuperviseurVoir",
  maintenant: "14:02",
  donnees: {
    titre: "Demande d'annulation",
    detail: `Guichet 1 · ${MARIE_T.nom} · demandée à 13:51, il y a 11 min`,
    badge: "PIN",
    billet: {
      _billetId: BILLET_0171.id,
      numero: BILLET_0171.numero,
      prix: BILLET_0171.prix,
      depart: { libelle: "Départ", valeur: "14:30 Yaoundé", siege: "· siège 9" },
      voyageur: { libelle: "Voyageur", valeur: "Essomba Rachel", piece: "· CNI ···· 3309" },
      vendu: { libelle: "Vendu", valeur: "09:12 · guichet 1 · cash · Marie T." },
      motif: { libelle: "Motif saisi", valeur: "« Client parti, ne voyage plus »" },
    },
    verifications: {
      titre: "Ce que l'app a vérifié",
      lignes: [
        { texte: "Billet", gras: "pas encore scanné", suite: "· le siège 9 est libérable" },
        {
          texte: "Plus de 1 h avant le départ ·",
          gras: "remboursement intégral",
          suite: "selon les règles de l'agence",
        },
        {
          marque: "!",
          gras: "2e annulation",
          suite: "de Marie aujourd'hui · 5 sur les 10 derniers jours (moyenne des guichets : 2)",
        },
        {
          marque: "i",
          suite: "Le client est présent au guichet · pièce vue · 4 000 F à lui rendre en cash",
        },
      ],
    },
    decision: {
      choix: ["Rembourser", "Reporter à demain", "Avoir 4 000"],
      choisi: "Rembourser",
    },
    pin: {
      titre: `Mon PIN · ${ESSONO.nom}`,
      aide: "Marie ne peut pas annuler seule",
      touches: ["Utiliser mon empreinte", "Effacer"],
      regle:
        "L'annulation garde le numéro 0171, passe à l'état « annulé », n'est pas facturée par AfriMove et apparaît nominativement dans le rapport du soir.",
    },
    actions: {
      refuser: "Refuser",
      annuler: { libelle: "Annuler · rembourser 4 000", detail: "siège 9 libéré · signé Essono" },
    },
    _decisionDomaine: decisionDomaine,
  },
  entites: { departs: [DEPART_ALPHA_1430], billets: [BILLET_0171] },
});
