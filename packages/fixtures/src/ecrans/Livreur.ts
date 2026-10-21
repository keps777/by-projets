import { repartitionLivraison } from "@afrimove/domain";
import { ecran } from "../ecran";
import { DEPART_ALPHA_BAF_0815, ERIC_T } from "../monde";
import { colisMamanArrive } from "../partage/colisMaman";

const colis = colisMamanArrive("moto");
const course = repartitionLivraison(1000);

/** 39 · App du livreur moto : Éric T. à Bafoussam reçoit la mission « Gare Alpha → Tamdja » (colis de Maman). */
export const Livreur = ecran({
  planche: "Livreur",
  maintenant: "13:06",
  donnees: {
    livreur: {
      _personneId: ERIC_T.id,
      initiales: "ÉT",
      nom: ERIC_T.nom,
      detail: "livreur n° 23 · Bafoussam · 4,9 ★",
      disponible: "Disponible",
      inviter: "+ inviter un livreur",
    },
    mission: {
      _colisId: colis.id,
      titre: "Nouvelle mission · 30 s pour accepter",
      decompte: "0:24",
      trajet: "Gare Alpha → Tamdja, chez Ngo Thérèse",
      detail: "colis 2 kg · 4,1 km · 14 min · remise contre code",
      gain: { montant: course.livreur, libelle: "pour toi" },
      actions: ["Passer", "Accepter · touche 1"],
    },
    regles: {
      titre: "Les 3 règles",
      texte:
        "1. Jamais de remise sans code. 2. Jamais de code demandé par téléphone. 3. Photo du colis remis, jamais de la pièce. Absent : 10 min, puis relais le plus proche.",
    },
    bilan: [
      { libelle: "Aujourd'hui", valeur: 6, detail: "livraisons" },
      { libelle: "Gagné", valeur: 4900, detail: "MoMo ce soir" },
      { libelle: "Semaine", valeur: "31 k", detail: "41 livraisons" },
    ],
    pieces: {
      titre: "Mes pièces",
      etat: "à jour",
      liste: [
        { libelle: "Permis", valeur: "valide 2028" },
        { libelle: "Assurance moto", valeur: "expire 02/27" },
        { libelle: "Gilet · casque", valeur: "n° 23" },
      ],
    },
    retrait: { libelle: "Retirer mes gains maintenant (dès 5 000 F)", action: "Retirer" },
  },
  visuel: { disponible: true },
  entites: { departs: [DEPART_ALPHA_BAF_0815], colis: [colis] },
});
