import { ecran } from "../ecran";
import { JOSEPH_M } from "../monde";

/** 34d · Modifier la fiche de Joseph M. (guichetier, Akwa guichet 2) : champs, droits par défaut du rôle. */
export const ConfigPersonne = ecran({
  planche: "ConfigPersonne",
  donnees: {
    titre: "Joseph M.",
    detail: "Guichetier · Akwa guichet 2 · depuis le 5 janv. 2027",
    badge: "MODIFIER",
    champs: {
      _personneId: JOSEPH_M.id,
      nom: { libelle: "Nom", valeur: JOSEPH_M.nom },
      telephone: { libelle: "Téléphone · reçoit le PIN", valeur: "6 77 12 34 23" },
      operateur: { libelle: "Opérateur", choix: ["MTN", "Orange"], valeur: "MTN" },
      role: {
        libelle: "Rôle",
        choix: ["Guichetier", "Superviseur", "Convoyeur", "Chauffeur", "Agent relais", "Comptable"],
        valeur: "Guichetier",
      },
      gare: {
        libelle: "Gare",
        choix: ["Akwa · Douala", "Mvan · Yaoundé", "Bafoussam"],
        valeur: "Akwa · Douala",
      },
      guichet: {
        libelle: "Guichet",
        choix: ["Guichet 2", "Guichet 1", "Guichet 3", "Nuit"],
        valeur: "Guichet 2",
      },
      salaire: { libelle: "Salaire · payé le 30", valeur: "95 000" },
    },
    droits: {
      titre: "Ce qu’il peut faire",
      aide: "par défaut du rôle",
      liste: [
        { libelle: "Vendre billets et colis · cash et MoMo", actif: true },
        { libelle: "Annuler un billet sans PIN du superviseur", actif: false },
        { libelle: "Mode cadence (vente sans nom)", actif: true },
        { libelle: "Voir la caisse des autres guichets", actif: false },
      ],
    },
    liens: [
      { titre: "Nouveau PIN provisoire", detail: "SMS · valable 1 h" },
      { titre: "Voir sa fiche · 90 jours", detail: "billets, écarts, journal" },
    ],
    note: "Pour une nouvelle personne : même écran, champs vides. Elle reçoit par SMS son PIN provisoire et le lien de l'app ; son compte s'ouvre à sa première connexion.",
    actions: {
      desactiver: { libelle: "Désactiver le compte", detail: "immédiat · tracé" },
      enregistrer: {
        libelle: "Enregistrer · mon PIN",
        detail: "daté, signé, visible au rapport du soir",
      },
    },
  },
});
