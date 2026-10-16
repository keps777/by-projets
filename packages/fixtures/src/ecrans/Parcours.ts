import { ecran } from "../ecran";
import type { NomPlanche } from "../planches";

/** Une case du parcours : elle ouvre la planche `_planche`. */
export interface CaseParcours {
  _planche: NomPlanche;
  /** Numéro de touche (1, 2, 3) quand la case en porte un. */
  touche?: number;
  titre: string;
  detail?: string;
}

const c = (_planche: NomPlanche, titre: string, detail?: string, touche?: number): CaseParcours => ({
  _planche,
  titre,
  ...(detail !== undefined ? { detail } : {}),
  ...(touche !== undefined ? { touche } : {}),
});

/** 43 · Carte des parcours : chaque grande fonctionnalité en 3 touches au plus, depuis l'accueil de son rôle. */
export const Parcours = ecran({
  planche: "Parcours",
  donnees: {
    entete: {
      surtitre: "Maquettes v3 · carte des parcours · chaque case ouvre son écran",
      titre: "Toutes les grandes fonctionnalités en 3 touches, pas une de plus",
    },
    legende: [
      { touche: 1, libelle: "touche 1 · depuis l'accueil" },
      { touche: 2, libelle: "touche 2 · choisir" },
      { touche: 3, libelle: "touche 3 · c'est fait" },
      { libelle: "écran de suivi, zéro touche" },
    ],
    voyageur: [
      {
        titre: "Première fois",
        sousTitre: "60 secondes",
        cases: [
          c("Splash", "Logo · jingle", "langue"),
          c("Connexion", "Numéro + SMS", "WhatsApp · USSD"),
          c("Tuto", "Tuto 3 écrans", "passer possible"),
          c("Main", "Accueil", "tout à 1 touche"),
        ],
      },
      {
        titre: "Acheter un billet",
        sousTitre: "le parcours n° 1",
        cases: [
          c("Main", "Départ dans la liste", undefined, 1),
          c("SiegePay", "Siège + MoMo, 1 écran", undefined, 2),
          c("Pass", "Payer → billet", undefined, 3),
          c("Direct", "Bus en direct", "prévenir Maman : 1"),
          c("Course", "Moto vers la gare", "réserver : 1"),
        ],
        puis: "puis",
      },
      {
        titre: "Autres façons de voyager",
        sousTitre: "toutes depuis l'accueil",
        cases: [
          c("Proche", "Pour un proche", "1 · départ 2 · payer 3"),
          c("MainVille", "Dans la même ville", "ville détectée · moto, covoit, bus"),
          c("Covoit", "Covoiturage", "1 · trajet 2 · payer 3"),
          c("CovoitConducteur", "Je conduis", "proposer : 1 · publier 2"),
          c("Groupe", "Groupe · bus entier", "1 · places 2 · payer 3"),
          c("Arret", "Monter en route", "1 · bus 2 · payer 3"),
          c("Reseau", "Réseau en direct", "1 · ligne 2 · siège 3"),
          c("USSD", "Sans internet", "*123# · 3 réponses"),
          c("Paiement", "Paiement", "MoMo · OM · carte"),
          c("Moi", "Moi", "fidélité · proches"),
        ],
      },
      {
        titre: "Envoyer un colis",
        sousTitre: "et le suivre",
        cases: [
          c("Main", "« Envoyer un colis »", undefined, 1),
          c("ColisEnvoi", "Photo + qui + où, 1 écran", undefined, 2),
          c("ColisCode", "Payer → code + suivi", undefined, 3),
          c("Relais", "Point relais", "choisir : 1"),
          c("Livraison", "Livraison moto", "suivi en direct"),
        ],
        puis: "puis",
      },
      {
        titre: "Partenaires",
        sousTitre: "chacun sa petite app",
        cases: [
          c("RelaisApp", "Point relais", "remettre : code 1 · photo 2"),
          c("Livreur", "Livreur moto", "accepter 1 · remettre 2"),
          c("Conducteur", "Conducteur covoit", "trajet 1 · publier 2"),
          c("Vendeur", "Vendeur ambulant", "départ 1 · siège 2 · payer 3"),
        ],
      },
    ],
    agence: [
      {
        titre: "Vendre au guichet",
        sousTitre: "le parcours n° 1 de l'agence",
        cases: [
          c("Guichet", "« Vendre un billet »", undefined, 1),
          c("Vente", "Départ · siège · nom, 1 écran", undefined, 2),
          c("Guichet", "Encaisser · imprimer", undefined, 3),
          c("Cadence", "Mode cadence", "1 touche par billet"),
          c("CadenceBillet", "La suite", "billet · quai · nom"),
        ],
        ou: "ou",
      },
      {
        titre: "Colis et quai",
        sousTitre: "depuis l'accueil guichet",
        cases: [
          c("GuichetColis", "Enregistrer un colis", "1 · photo+infos 2 · étiquette 3"),
          c("Depot", "Dépôt prépayé", "1 · scan 2 · accepter 3"),
          c("Quai", "Quai · scanner", "1 · scan en continu"),
          c("Convoyeur", "Vente en route", "1 · places 2 · cash 3"),
          c("Chauffeur", "Chauffeur", "incident : 1 touche"),
          c("Controleur", "Contrôle inopiné", "siège 1 · régulariser 2"),
        ],
      },
      {
        titre: "Fermer la caisse",
        sousTitre: "l'argent, chaque soir",
        cases: [
          c("Guichet", "« Ma caisse »", undefined, 1),
          c("Caisse", "Compter les billets", undefined, 2),
          c("Superviseur", "PIN du superviseur", undefined, 3),
          c("RapportSoir", "Rapport 21 h", "WhatsApp, zéro touche"),
        ],
      },
      {
        titre: "Patron",
        sousTitre: "tout à 1 touche de l'accueil",
        cases: [
          c("Patron", "Accueil patron", "chiffres du jour"),
          c("Assistant", "Assistant", "agir : 1"),
          c("Analyses", "Analyses", "lignes · bus"),
          c("Comptable", "Comptable", "export : 1"),
          c("Config", "Réglages", "lignes · équipe"),
          c("Modules", "Modules", "12 interrupteurs"),
          c("Financement", "Financement", "demander : 1"),
          c("InterAgences", "Inter-agences", "règlement lundi"),
          c("Controle", "Salle de contrôle", "web · 1280 px"),
        ],
      },
    ],
    regle: {
      titre: "La règle, fonction par fonction",
      sousTitre: "touches depuis l'accueil de son rôle",
      fonctions: [
        { fonction: "Acheter un billet, siège choisi, payé", touches: 3 },
        { fonction: "Vendre un billet au guichet, imprimé", touches: 3 },
        { fonction: "Payer pour un proche à l'étranger", touches: 3 },
        { fonction: "Billet en mode cadence", touches: 1 },
        { fonction: "Envoyer un colis avec code", touches: 3 },
        { fonction: "Enregistrer un colis au guichet", touches: 3 },
        { fonction: "Suivre son colis, prévenir un proche", touches: 1 },
        { fonction: "Scanner au quai", touches: 1 },
        { fonction: "Covoiturage réservé et payé", touches: 3 },
        { fonction: "Fermer sa caisse, validée", touches: 3 },
        { fonction: "Groupe ou bus entier", touches: 3 },
        { fonction: "Signaler un incident (chauffeur)", touches: 1 },
        { fonction: "Moto vers la gare", touches: 2 },
        { fonction: "Lire le rapport du soir", touches: 0 },
        { fonction: "Billet sans internet (*123#)", touches: 3 },
        { fonction: "Activer ou masquer un module", touches: 2 },
      ],
    },
  },
});
