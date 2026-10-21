import { ecran } from "../ecran";
import { COLIS_MAMAN, DEPART_ALPHA_BAF_0815, colisDe } from "../monde";
import { AICHA, ALPHA_AKWA, ALPHA_BAFOUSSAM, MAMAN } from "../monde";
import { HACHE_COLIS_0017, SEL_COLIS_0017 } from "../monde";

/** Le colis de Maman au moment où le guichet le scanne : payé dans l'app, pas encore accepté. */
const colis = colisDe({
  gareOrigine: ALPHA_AKWA,
  gareDestination: ALPHA_BAFOUSSAM,
  depart: DEPART_ALPHA_BAF_0815,
  sequence: 17,
  expediteur: { nom: "Ngo Aïcha", telephone: AICHA.telephone },
  destinataire: { nom: "Ngo Thérèse", telephone: MAMAN.telephone },
  contenu: "Médicaments, vêtements",
  poidsKg: 2,
  valeurDeclaree: 25_000,
  assure: true,
  mode: "gare",
  canal: "app",
  codeRetraitHache: HACHE_COLIS_0017,
  codeRetraitSel: SEL_COLIS_0017,
  prixTotal: COLIS_MAMAN.prixTotal,
  creeA: "07:40",
});

/** 22 · Dépôt d'un colis prépayé : le guichet scanne le code du client. C-ALP-DLA-270105-0017. */
export const Depot = ecran({
  planche: "Depot",
  maintenant: "07:40",
  donnees: {
    titre: "Dépôt prépayé",
    sousTitre: "Le client a payé dans l'app · scanner son code",
    code: "C-ALP-DLA-270105-0017",
    trouve: { libelle: "Trouvé · payé 2 200 F dans l'app", heure: "07:40" },
    fiche: {
      de: { nom: "Ngo Aïcha", detail: "· 6 91 22 10 08" },
      pour: { nom: "Ngo Thérèse", detail: "· Bafoussam gare" },
      declare: "Médicaments, vêtements · 2 kg · 25 000 F · assuré",
      depart: "08:15 Alpha Bafoussam · soute 60 %",
    },
    verifications: [
      { libelle: "Vérifier le poids", detail: "2,1 kg · conforme" },
      { libelle: "Photo au dépôt", detail: "à prendre" },
    ],
    note: "Rien à encaisser. Si le poids dépasse de plus de 1 kg, l'app propose un complément à payer par MoMo au client.",
    action: "Accepter · imprimer l'étiquette",
  },
  entites: { departs: [DEPART_ALPHA_BAF_0815], colis: [colis] },
});
