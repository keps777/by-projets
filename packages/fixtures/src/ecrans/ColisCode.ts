import { ecran } from "../ecran";
import { COLIS_MAMAN, DEPART_ALPHA_BAF_0815 } from "../monde";

/**
 * 14 · Colis pour Maman : code de retrait, suivi, photo. Le colis est en route depuis 11:20 (le
 * message de l'accueil, lui, le dit déjà arrivé : voir INCOHERENCES.md).
 */
export const ColisCode = ecran({
  planche: "ColisCode",
  maintenant: "11:30",
  donnees: {
    titre: "Colis pour Maman",
    resume: "C-ALP-DLA-270105-0017 · 2 kg · assuré 25 000",
    retrait: {
      _colisId: COLIS_MAMAN.id,
      libelle: "Code de retrait · à donner à Maman seulement",
      code: "482 913",
      consigne: "Remis contre ce code + sa pièce. Jamais sur l'étiquette, jamais au téléphone.",
      photo: { libelle: "photo au dépôt", heure: "07:52" },
      action: "Envoyer le code",
    },
    suivi: [
      {
        etape: "Déposé",
        detail: "· gare Alpha Douala · étiquette imprimée",
        heure: "07:52",
      },
      {
        etape: "Chargé",
        detail: "· bus LT 118 AB · scanné par le convoyeur",
        heure: "08:10",
      },
      {
        etape: "En route",
        detail: "· après Bafang · arrivée vers 13:00",
        heure: "11:20",
      },
      {
        detail: "Disponible à Bafoussam · SMS à Maman avec le lieu",
        heure: "~13:00",
      },
      {
        detail: "Remis · photo de la remise envoyée aux deux",
        heure: "—",
      },
    ],
    options: [
      { titre: "Faire livrer chez elle", detail: "moto · 1 000 F · dès l'arrivée" },
      { titre: "Déposer en relais", detail: "près de chez elle · 300 F" },
    ],
    reclamation:
      "Un problème ? Réclamation en 1 touche, réponse sous 2 jours ouvrés. Perte prouvée par le suivi : 10 × le port, ou la valeur assurée.",
  },
  entites: { departs: [DEPART_ALPHA_BAF_0815], colis: [COLIS_MAMAN] },
});
