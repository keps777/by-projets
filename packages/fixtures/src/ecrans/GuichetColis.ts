import { devisColis } from "@afrimove/domain";
import { ecran } from "../ecran";
import { DEPART_ALPHA_BAF_0815, colisDe } from "../monde";
import { AICHA, ALPHA_AKWA, ALPHA_BAFOUSSAM, MAMAN } from "../monde";

/** En agence, les 150 F de frais sont à la charge de l'agence : 1 500 de port + 500 d'assurance. */
const devis = devisColis({ port: 1500, canal: "agence", mode: "gare", valeurAssuree: 25_000 });

const colis = colisDe({
  gareOrigine: ALPHA_AKWA,
  gareDestination: ALPHA_BAFOUSSAM,
  depart: DEPART_ALPHA_BAF_0815,
  sequence: 42,
  expediteur: { nom: "Ngo Aïcha", telephone: AICHA.telephone },
  destinataire: { nom: "Ngo Thérèse", telephone: MAMAN.telephone },
  contenu: "Médicaments, vêtements",
  poidsKg: 2,
  valeurDeclaree: 25_000,
  assure: true,
  mode: "gare",
  canal: "agence",
  codeRetraitHache: "9e9e27087eb235a88f4e324da214a9bea8f31c527e7783384ebd8d49423b0359",
  codeRetraitSel: "b42d19e7c3a05f8e6d1b2c4a97e03f56",
  prixTotal: devis.total,
  creeA: "08:05",
});

/** 21 · Colis au guichet : photo, étiquette 58 × 40 mm, encaissement. C-ALP-DLA-270105-0042. */
export const GuichetColis = ecran({
  planche: "GuichetColis",
  maintenant: "08:05",
  donnees: {
    titre: "Enregistrer un colis",
    guichet: "C-ALP-DLA-270105-0042 · guichet 2",
    photo: { libelle: "Photo prise ✓", action: "reprendre" },
    formulaire: {
      expediteur: "Ngo Aïcha · 6 91 22 10 08",
      destinataire: "Ngo Thérèse · 6 99 40 18 22",
      contenu: "Médicaments, vêtements",
      poids: "2 kg",
      valeur: 25000,
    },
    departs: [
      { heure: "08:15", detail: "Bafoussam · soute 60 %", choisi: true },
      { heure: "10:00", detail: "Bafoussam · 20 %", choisi: false },
      { libelle: "Autre ville", detail: "via une autre compagnie", choisi: false },
    ],
    etiquette: {
      titre: "Aperçu de l'étiquette · 58 × 40 mm",
      imprimante: "imprimante OK",
      trajet: "DLA → BAF",
      destinataire: "Ngo Thérèse · ···· 18 22",
      reference: "C-ALP-DLA-270105-0042 · 2 kg · 08:15",
      pied: "Alpha Voyages · afrimove.cm · pas de code ici",
    },
    paiement: [
      { mode: "Cash", montant: devis.total, choisi: true },
      { mode: "MoMo", choisi: false },
      { mode: "Assurance ✓", montant: 500, choisi: true },
    ],
    action: {
      libelle: "Encaisser · imprimer l'étiquette",
      detail: "touche 3 · code de retrait envoyé au destinataire seul",
      montant: devis.total,
    },
  },
  entites: { departs: [DEPART_ALPHA_BAF_0815], colis: [colis] },
});
