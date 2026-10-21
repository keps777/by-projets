import { ecran } from "../ecran";
import {
  ALPHA_AKWA,
  BUS_LT118,
  BUS_OMEGA_OU302,
  DEPART_ALPHA_BAF_0815,
  JEAN_K,
  NGONO_ALBERTINE,
  OMEGA_BAMENDA,
  colisDe,
} from "../monde";

/**
 * Le colis C-ALP-DLA-270105-0088 de 3 kg, Douala → Bamenda : Alpha le porte jusqu'à Bafoussam
 * (08:15, LT 118 AB), Oméga ensuite (14:00, OU 302 NW). Code de retrait 719264 (haché ici).
 */
const colis0088 = colisDe({
  gareOrigine: ALPHA_AKWA,
  gareDestination: OMEGA_BAMENDA,
  depart: DEPART_ALPHA_BAF_0815,
  sequence: 88,
  expediteur: { nom: JEAN_K.nom, telephone: JEAN_K.telephone },
  destinataire: { nom: "Ngono Albertine", telephone: NGONO_ALBERTINE.telephone },
  contenu: "Colis 3 kg",
  poidsKg: 3,
  valeurDeclaree: 0,
  assure: false,
  mode: "gare",
  canal: "agence",
  codeRetraitHache: "53f23bb12e168c31c8eaf02b58be1ff3875dfbb2124b4f1394b754408020bc58",
  codeRetraitSel: "c88e2f3a1b4d6c7095e8a1f2b3d4c5e6",
  prixTotal: 3000,
  creeA: "07:48",
  etapes: [
    { action: "charger", a: "08:10", par: "pers-convoyeur" },
    { action: "expedier", a: "11:20" },
  ],
});

/** 37 · Colis entre compagnies : deux tronçons, deux compagnies payées, règlement net le lundi. */
export const InterAgences = ecran({
  planche: "InterAgences",
  donnees: {
    titre: "Entre compagnies",
    sousTitre: "Un colis change de bus en route. Chacun est payé pour son tronçon.",
    colis: {
      _colisId: colis0088.id,
      titre: "Douala → Bamenda · colis C-ALP-DLA-270105-0088",
      poids: "3 kg",
      troncons: [
        {
          libelle: "Tronçon 1 · Alpha",
          trajet: "Douala → Bafoussam",
          horaire: `08:15 · ${BUS_LT118.immatriculation} · arrivée 13:00`,
          part: "1 500 · pour Alpha",
        },
        {
          libelle: "Tronçon 2 · Oméga",
          trajet: "Bafoussam → Bamenda",
          horaire: `14:00 · ${BUS_OMEGA_OU302.immatriculation} · arrivée 16:30`,
          part: "1 200 · pour Oméga",
        },
      ],
      regle:
        "À Bafoussam, le convoyeur Alpha scanne « remis à Oméga », le convoyeur Oméga scanne « reçu ». Le client suit un seul numéro. La responsabilité passe au scan.",
    },
    reglement: {
      titre: "Règlement entre compagnies · semaine",
      jour: "lundi",
      lignes: [
        { libelle: "Oméga te doit · 14 colis transportés pour eux", montant: 19_500 },
        { libelle: "Tu dois à Oméga · 6 colis en correspondance", montant: -7200 },
        { libelle: "Solde net · réglé par MoMo lundi 08:00", montant: 12_300 },
      ],
    },
    voyageurs: {
      titre: "Aussi pour les voyageurs",
      texte:
        "Yaoundé → Bamenda en un seul billet : Alpha jusqu'à Bafoussam, Oméga ensuite, correspondance de 25 min garantie. Si le premier bus est en retard, le second attend 15 min ou le voyageur est replacé gratuitement.",
    },
    actions: ["Convention Oméga · voir", "Ajouter une compagnie"],
  },
  entites: { departs: [DEPART_ALPHA_BAF_0815], colis: [colis0088] },
});
