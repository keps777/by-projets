import type { ActionColis, Colis } from "@afrimove/domain";
import { ecran } from "../ecran";
import { jourDecale } from "../horloge";
import {
  ALPHA_AKWA,
  ALPHA_BAFOUSSAM,
  DEPART_ALPHA_BAF_0815,
  JEAN_K,
  MAMA_FOTSO,
  CODE_RETRAIT_COLIS_0017,
  colisDe,
} from "../monde";
import type { Etape } from "../monde";
import { colisMamanArrive } from "../partage/colisMaman";

/** Le colis de Maman, en garde chez Mama Fotso depuis 13:10 : la remise du matin-midi se fait ici. */
const colis0017 = colisMamanArrive("relais");

function colisEnGarde(p: {
  sequence: number;
  jours: number;
  destinataire: string;
  telephone: string;
  poidsKg: number;
  hache: string;
  sel: string;
}): Colis {
  const jour = jourDecale(-p.jours);
  const etapes: Etape<ActionColis>[] = [
    { action: "charger", a: "08:10", jour },
    { action: "expedier", a: "08:20", jour },
    { action: "decharger", a: "13:00", jour },
    { action: "rendre_disponible", a: "13:05", jour },
    { action: "envoyer_en_relais", a: "13:30", jour },
  ];
  return colisDe({
    gareOrigine: ALPHA_AKWA,
    gareDestination: ALPHA_BAFOUSSAM,
    depart: null,
    sequence: p.sequence,
    expediteur: { nom: JEAN_K.nom, telephone: JEAN_K.telephone },
    destinataire: { nom: p.destinataire, telephone: p.telephone },
    contenu: "Colis",
    poidsKg: p.poidsKg,
    valeurDeclaree: 0,
    assure: false,
    mode: "relais",
    canal: "agence",
    codeRetraitHache: p.hache,
    codeRetraitSel: p.sel,
    prixTotal: 1500,
    creeA: "07:10",
    jour,
    etapes,
  });
}

const colis0011 = colisEnGarde({
  sequence: 11,
  jours: 2,
  destinataire: "Kamdem J.",
  telephone: "+237671000011",
  poidsKg: 1,
  hache: "9f209200d6a37a1228d75aa04b27d35492d6bf156c271e727a64be21a6975ba4",
  sel: "d11a3b5c7e9f1a2c4e6b8d0f1a3c5e79",
});

const colis0009 = colisEnGarde({
  sequence: 9,
  jours: 6,
  destinataire: "Tagne M.",
  telephone: "+237693000009",
  poidsKg: 4,
  hache: "98e730c2c3c7a43944a2a71c8480b0566c5419bdd2ff659109c786261b6f6574",
  sel: "e09f2d4b6a8c0e1f3a5c7b9d1e3f5a70",
});

/** 38 · App du point relais : la boutique Mama Fotso à Bafoussam, une remise en cours, 7 colis en garde. */
export const RelaisApp = ecran({
  planche: "RelaisApp",
  maintenant: "13:20",
  donnees: {
    boutique: {
      _personneId: MAMA_FOTSO.id,
      nom: `Boutique ${MAMA_FOTSO.nom}`,
      detail: "Point relais AfriMove · Bafoussam · ouvert",
      note: "4,9 ★",
      inscrire: "+ inscrire une boutique",
    },
    resume: [
      { libelle: "En garde", valeur: 7, sur: 30 },
      { libelle: "Arrivent", valeur: 3, detail: "vers 13:30" },
      { libelle: "Semaine", valeur: 8400, detail: "42 remis · lundi MoMo" },
    ],
    actions: [
      { titre: "Remettre", detail: "code + pièce · touche 1" },
      { titre: "Recevoir", detail: "scanner l'étiquette" },
    ],
    remise: {
      _colisId: colis0017.id,
      titre: "Remise en cours",
      colis: "C-…-0017 · pour Ngo Thérèse",
      verification:
        "Pièce vérifiée : CNI au nom de Ngo Thérèse. Ne pas photographier la pièce. Photo du colis remis à la fin.",
    },
    enGarde: {
      titre: "En garde · 7",
      aide: "repris à J+7",
      liste: [
        {
          _colisId: colis0011.id,
          colis: "C-…-0011",
          detail: "· Kamdem J. · 1 kg · depuis 2 j",
          telephone: "6 71 …",
        },
        {
          _colisId: colis0009.id,
          colis: "C-…-0009",
          detail: "· Tagne M. · 4 kg ·",
          rappel: "depuis 6 j · rappel envoyé",
          telephone: "6 93 …",
        },
      ],
    },
    action: "Colis remis · photo · + 200 F",
  },
  visuel: {
    // Code de retrait en cours de saisie : 4 8 2 9 1 puis une case vide (le code est 482913).
    saisie: CODE_RETRAIT_COLIS_0017.slice(0, 5),
  },
  entites: {
    departs: [DEPART_ALPHA_BAF_0815],
    colis: [colis0017, colis0011, colis0009],
  },
});
