import { appliquerBillet } from "@afrimove/domain";
import { ecran } from "../ecran";
import { heure } from "../horloge";
import {
  ALPHA,
  ALPHA_DLA_BAF,
  ALPHA_DLA_YDE,
  BUS_LT118,
  BUS_LT412,
  ESSONO,
  JOSEPH_M,
  MARIE_T,
  PAULINE_N,
  SESSION_JOSEPH,
  departDe,
} from "../monde";
import { BILLET_0171, DEPART_ALPHA_1430 } from "../partage/caisse";

/** Le billet 0171 tel que le journal de la gare le montre : annulé à 11:15, validé par Mme Essono. */
const billet0171Annule = appliquerBillet(BILLET_0171, "annuler", {
  at: heure("11:15"),
  par: ESSONO.id,
  motif: "client parti",
});

/** Les deux prochains départs de la gare : 16:00 Yaoundé (LT 412 AB) et 17:00 Bafoussam (LT 118 AB). */
const depart1600 = departDe({
  cie: ALPHA,
  ligne: ALPHA_DLA_YDE,
  hhmm: "16:00",
  classe: "classique",
  busId: BUS_LT412.id,
  etapes: [{ action: "ouvrir_vente", a: "04:00" }],
});
const depart1700 = departDe({
  cie: ALPHA,
  ligne: ALPHA_DLA_BAF,
  hhmm: "17:00",
  classe: "classique",
  busId: BUS_LT118.id,
  etapes: [{ action: "ouvrir_vente", a: "04:00" }],
});

/** 30c · La gare d'Akwa vue par le patron à 14:02 : caisse 1,41 M, trois guichets, deux quais, journal. */
export const PatronGare = ecran({
  planche: "PatronGare",
  maintenant: "14:02",
  donnees: {
    titre: "Gare d’Akwa · Douala",
    detail: `Superviseure ${ESSONO.nom} · 3 guichets · 2 quais · 14:02`,
    synchro: "3 / 3 sync",
    chiffres: [
      { libelle: "Caisse", valeur: "1,41 M", detail: "depuis 05:30" },
      { libelle: "Billets", valeur: 318, detail: "86 % rempli" },
      { libelle: "Colis", valeur: 96, detail: "12 au relais" },
      { libelle: "Écart", valeur: -1000, detail: "guichet 2" },
    ],
    guichets: {
      titre: "Guichets · qui, combien, état",
      aide: "touche un guichet",
      liste: [
        {
          _personneId: MARIE_T.id,
          initiales: "MT",
          nom: "Guichet 1 · Marie T.",
          detail: "142 billets · 38 colis · 0 écart",
          caisse: 612_000,
          etat: "sync 14:01",
        },
        {
          _personneId: JOSEPH_M.id,
          _sessionId: SESSION_JOSEPH.id,
          initiales: "JM",
          nom: "Guichet 2 · Joseph M.",
          detail: "121 billets · 31 colis · écart − 1 000 · clôture attend PIN",
          caisse: 694_500,
          etat: "sync 14:00",
        },
        {
          _personneId: PAULINE_N.id,
          initiales: "PN",
          nom: "Guichet 3 · Pauline N.",
          detail: "55 billets · 27 colis · bloquée depuis 09:40",
          caisse: 105_500,
          etat: "bloqué",
        },
      ],
    },
    quais: {
      titre: "Quais · prochains départs",
      aide: "2 quais",
      liste: [
        {
          _departId: depart1600.id,
          depart: "16:00 · Douala → Yaoundé · LT 412 AB",
          detail: "Mbarga · Alain B. · 27 / 30 · embarquement 15:30",
          libres: "3 libres",
        },
        {
          _departId: depart1700.id,
          depart: "17:00 · Douala → Bafoussam · LT 118 AB",
          detail: "Fotso · 18 / 30 · 09:30 Oméga en face",
          libres: "12 libres",
        },
      ],
    },
    journal: {
      titre: "Journal de la gare · aujourd’hui",
      aide: "3 événements",
      evenements: [
        {
          heure: "09:40",
          texte: "· Pauline N. bloquée · 3 PIN faux · superviseure prévenue",
          etat: "ouvert",
        },
        {
          _billetId: billet0171Annule.id,
          heure: "11:15",
          texte: "· annulation 0171 · 4 000 · « client parti » · validée Essono",
          etat: "tracé",
        },
        {
          _sessionId: SESSION_JOSEPH.id,
          heure: "14:00",
          texte: "· clôture guichet 2 · écart − 1 000 · 3e en 10 jours",
          etat: "attend PIN",
        },
      ],
    },
    regle:
      "Tu vois tout, tu ne touches pas la caisse : les validations restent à la superviseure, chaque geste est signé par son PIN.",
    actions: {
      rapport: "Rapport 21 h d’hier",
      caisse: { libelle: "Caisse en direct", detail: "1 412 000 · 3 guichets · live" },
    },
  },
  entites: {
    departs: [DEPART_ALPHA_1430, depart1600, depart1700],
    billets: [billet0171Annule],
    sessions: [SESSION_JOSEPH],
  },
});
