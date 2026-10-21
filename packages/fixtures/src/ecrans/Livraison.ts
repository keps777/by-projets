import { repartitionLivraison } from "@afrimove/domain";
import { ecran } from "../ecran";
import { COLIS_MAMAN, DEPART_ALPHA_BAF_0815, colisDe } from "../monde";
import { ALPHA_AKWA, ALPHA_BAFOUSSAM, AICHA, MAMAN } from "../monde";
import { CODE_RETRAIT_COLIS_0017, HACHE_COLIS_0017, SEL_COLIS_0017 } from "../monde";

const livraison = repartitionLivraison(1000);

/** Le colis de Maman à 13:18 : arrivé à Bafoussam, remis à un livreur moto (mode « moto »). */
const colisEnLivraison = colisDe({
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
  mode: "moto",
  canal: "app",
  codeRetraitHache: HACHE_COLIS_0017,
  codeRetraitSel: SEL_COLIS_0017,
  prixTotal: COLIS_MAMAN.prixTotal + livraison.livreur + livraison.afrimove,
  creeA: "07:52",
  etapes: [
    { action: "charger", a: "08:10" },
    { action: "expedier", a: "11:20" },
    { action: "decharger", a: "13:00" },
    { action: "rendre_disponible", a: "13:05" },
    { action: "mettre_en_livraison", a: "13:05", par: "pers-eric-t" },
  ],
});

/** 16 · Livraison moto en cours : Éric T. arrive chez Maman à 13:24. */
export const Livraison = ecran({
  planche: "Livraison",
  maintenant: "13:18",
  donnees: {
    carte: ["Gare Alpha · retiré 13:05", "Éric · 6 min", "Chez Maman · Tamdja"],
    statut: "EN LIVRAISON",
    arrivee: {
      _colisId: colisEnLivraison.id,
      libelle: "Arrive chez Maman",
      heure: "13:24",
      colis: "colis C-…-0017",
      detail: "2 kg · assuré",
    },
    livreur: {
      initiales: "ÉT",
      nom: "Éric T. · livreur moto",
      reputation: "vérifié · 4,9 ★ · 340 livraisons",
      moto: "OU 517 MT · gilet AfriMove n° 23",
    },
    remise: {
      libelle: "À la remise",
      etat: "Maman a le code",
      texte: `Éric demande le code ${CODE_RETRAIT_COLIS_0017.replace(/(\d{3})(\d{3})/, "$1 $2")} et regarde la pièce. Il prend une photo du colis remis. Tu reçois la photo, Maman aussi. Si elle est absente, il attend 10 min puis dépose chez Mama Fotso.`,
    },
    actions: ["Partager le suivi à Maman", "Changer l'adresse"],
    devenir: {
      titre: "Tu as une moto ? Deviens livreur AfriMove",
      detail: "700 F la course · tu choisis tes heures et ta zone · inscription 3 min",
    },
    pied: {
      libelle: "Livraison 1 000 F · payée · 700 F pour Éric à la remise",
      assurance: "assuré",
    },
  },
  entites: { departs: [DEPART_ALPHA_BAF_0815], colis: [colisEnLivraison] },
});
