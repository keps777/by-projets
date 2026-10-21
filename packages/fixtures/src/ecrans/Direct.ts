import { ecran } from "../ecran";
import { billetDe, departDe } from "../monde";
import { AICHA, BETA, BETA_AKWA, BETA_DLA_YDE, BUS_LT412 } from "../monde";

/**
 * Le bus LT 412 AB est ici un bus de Bêta Express (il appartient à Alpha Voyages au quai et au
 * contrôle) : le scénario le déclare dans ses propres entités, sans toucher au monde commun.
 */
const busBeta = {
  ...BUS_LT412,
  id: "bus-bex-lt412ab",
  compagnieId: BETA.id,
  classe: "vip",
} as const;

const depart = departDe({
  cie: BETA,
  ligne: BETA_DLA_YDE,
  hhmm: "08:00",
  classe: "vip",
  busId: busBeta.id,
  etapes: [
    { action: "ouvrir_vente", a: "04:00" },
    { action: "ouvrir_embarquement", a: "07:40" },
    { action: "partir", a: "08:04" },
  ],
});

const billet = billetDe({
  cie: BETA,
  gare: BETA_AKWA,
  depart,
  sequence: 142,
  siege: 7,
  classe: "vip",
  prix: 7500,
  canal: "en_ligne",
  passager: { nom: "Aïcha Ngo", telephone: AICHA.telephone, pieceQuatreDerniers: "4471" },
  codeBillet: "7341",
  creeA: "07:39",
  etapes: [
    { action: "payer", a: "07:39" },
    { action: "embarquer", a: "07:58" },
  ],
});

/** 4 · Mon bus en direct : arrivée estimée, étapes, prévenir un proche. */
export const Direct = ecran({
  planche: "Direct",
  donnees: {
    statut: "EN DIRECT",
    carte: { villes: ["Douala", "Edéa", "Yaoundé"], vitesse: "84 km/h" },
    arrivee: {
      libelle: "Arrivée estimée",
      heure: "11:35",
      detail: "prévu 11:30 · 5 min de retard",
    },
    billet: { _billetId: billet.id, compagnie: "Bêta Express · siège 7", bus: "LT 412 AB" },
    prevenir: {
      titre: "Prévenir Maman quand j'arrive",
      detail: "1 touche · elle reçoit un SMS 15 min avant Mvan",
    },
    etapes: [
      { libelle: "Douala Akwa · parti", heure: "08:04" },
      { libelle: "Edéa · arrêt 10 min", heure: "09:12" },
      { libelle: "Pouma · prochain arrêt", heure: "10:05" },
      { libelle: "Boumnyebel · 4 places montent ici", heure: "10:40" },
    ],
    actions: ["Chauffeur", "Signaler", "Mon colis"],
  },
  entites: { bus: [busBeta], departs: [depart], billets: [billet] },
});
