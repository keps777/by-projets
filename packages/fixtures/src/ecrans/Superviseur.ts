import { ecran } from "../ecran";
import { nombre } from "../format";
import { ESSONO, SESSION_JOSEPH } from "../monde";
import {
  BILLET_0171,
  CAISSE_JOSEPH as K,
  DEPART_ALPHA_1430,
  DEPART_ALPHA_1600,
  DEPART_ALPHA_1630,
  DEPART_ALPHA_BAF_1500,
} from "../partage/caisse";

/** 28 · Superviseur de gare, 14:02 : deux demandes attendent son PIN, trois guichets, l'après-midi. */
export const Superviseur = ecran({
  planche: "Superviseur",
  maintenant: "14:02",
  donnees: {
    titre: "Superviseur · Akwa",
    detail: `${ESSONO.nom} · 3 guichets · 2 quais · 14:02`,
    synchro: "3 / 3 sync",
    demandes: {
      titre: "2 demandes attendent ton PIN",
      aide: "touche 1 · PIN · fait",
      liste: [
        {
          _sessionId: SESSION_JOSEPH.id,
          type: "Clôture guichet 2",
          detail: `· Joseph · écart ${nombre(K.evaluation.ecart)} · compté ${nombre(K.compte)}`,
          action: "Valider · PIN",
        },
        {
          _billetId: BILLET_0171.id,
          type: "Annulation",
          detail: "· guichet 1 · billet 0171 · 4 000 · « client parti »",
          action: "Voir · PIN",
        },
      ],
    },
    guichets: [
      { libelle: "Guichet 1", billets: 211, etat: "écart 0 · ouvert" },
      { libelle: "Guichet 2", billets: 184, etat: "− 1 000 · à valider" },
      { libelle: "Guichet 3", billets: 96, etat: "ouvert 09:00" },
    ],
    apresMidi: {
      titre: "Départs de l'après-midi",
      aide: "remplissage",
      departs: [
        {
          _departId: DEPART_ALPHA_1430.id,
          heure: "14:30",
          destination: "Yaoundé · quai 3 · LT 207 AB",
          remplissage: "38/40",
        },
        {
          _departId: DEPART_ALPHA_BAF_1500.id,
          heure: "15:00",
          destination: "Bafoussam · quai 1 · LT 118 AB",
          remplissage: "19/40",
        },
        {
          _departId: DEPART_ALPHA_1600.id,
          heure: "16:00",
          destination: "Yaoundé · quai 3 ·",
          fusion: "fusion proposée avec 16:30",
          remplissage: "9/40",
        },
      ],
    },
    raccourcis: ["Contrôle", "Équipe · PIN", "Débloquer 12 h", "Rapport 21 h"],
    navigation: ["Gare", "Caisses", "Quais", "Patron"],
  },
  visuel: { departFusionne: DEPART_ALPHA_1630.id },
  entites: {
    departs: [DEPART_ALPHA_1430, DEPART_ALPHA_BAF_1500, DEPART_ALPHA_1600, DEPART_ALPHA_1630],
    billets: [BILLET_0171],
    sessions: [SESSION_JOSEPH],
  },
});
