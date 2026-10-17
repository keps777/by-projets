/** Généré à partir de docs/maquettes-v3/canvas.json et de la table « Planche → route → ticket » de docs/tickets.md (section 5). */
export interface InfoPlanche {
  /** Titre de la planche dans le canevas des maquettes. */
  readonly titre: string;
  /** Route de l'application, ou null pour les planches de référence (Parcours, Système). */
  readonly route: string | null;
  /** Tickets d'écran correspondants. */
  readonly tickets: readonly string[];
}

export const PLANCHES = {
  Splash: {
    titre: "0a · Première ouverture · logo, jingle, langue",
    route: "/bienvenue",
    tickets: ["AM-020"],
  },
  Connexion: {
    titre: "0b · Connexion · numéro + code SMS · WhatsApp · USSD",
    route: "/connexion",
    tickets: ["AM-021"],
  },
  Tuto: {
    titre: "0c · Tutoriel · 3 écrans · tout en 3 touches",
    route: "/tutoriel",
    tickets: ["AM-022"],
  },
  Main: {
    titre: "1 · Accueil — départs en direct (1 touche vers tout)",
    route: "/(voyageur)/voyager",
    tickets: ["AM-030", "AM-183"],
  },
  SiegePay: {
    titre: "2 · Siège + paiement en un écran (touche 2 → 3)",
    route: "/(voyageur)/depart/[departId]",
    tickets: ["AM-033"],
  },
  Pass: {
    titre: "3 · Billet · QR · code 4 chiffres",
    route: "/(voyageur)/billet/[billetId]",
    tickets: ["AM-035"],
  },
  Direct: {
    titre: "4 · Mon bus en direct · prévenir un proche",
    route: "/(voyageur)/billet/[billetId]/direct",
    tickets: ["AM-040", "AM-183"],
  },
  Reseau: {
    titre: "5 · Le réseau en direct · toutes les compagnies",
    route: "/(voyageur)/reseau",
    tickets: ["AM-036"],
  },
  Covoit: {
    titre: "6 · Covoiturage · interurbain et en ville",
    route: "/(voyageur)/covoit",
    tickets: ["AM-050"],
  },
  Paiement: {
    titre: "7 · Paiement · MoMo · OM · carte · depuis l'étranger",
    route: "/(voyageur)/paiement/[commandeId]",
    tickets: ["AM-034"],
  },
  Course: {
    titre: "8 · Moto ou taxi vers la gare",
    route: "/(voyageur)/course",
    tickets: ["AM-042"],
  },
  MainVille: {
    titre: "1b · Accueil · mode « dans la même ville » (ville détectée, départ, arrivée)",
    route: "/(voyageur)/voyager/ville",
    tickets: ["AM-032"],
  },
  CovoitVille: {
    titre: "6b · Covoiturage · en ville · passager",
    route: "/(voyageur)/covoit/ville",
    tickets: ["AM-051"],
  },
  CovoitConducteur: {
    titre: "6c · Covoiturage · je conduis (proposer mon trajet)",
    route: "/(voyageur)/covoit/conducteur",
    tickets: ["AM-183", "AM-052"],
  },
  MainFiltres: {
    titre:
      "1c · Accueil · filtre déroulant : classe, compagnies (une, plusieurs, toutes), préférées",
    route: "/(voyageur)/voyager/filtres",
    tickets: ["AM-031"],
  },
  Arret: {
    titre: "9 · Monter en route · arrêts",
    route: "/(voyageur)/monter-en-route",
    tickets: ["AM-041"],
  },
  Groupe: {
    titre: "10 · Groupe · bus entier · cagnotte",
    route: "/(voyageur)/groupe",
    tickets: ["AM-183", "AM-043"],
  },
  USSD: {
    titre: "11 · USSD *123# et WhatsApp · téléphone simple",
    route: "/(voyageur)/sans-internet",
    tickets: ["AM-045"],
  },
  Moi: {
    titre: "12 · Moi · fidélité · parrainage · proches · historique",
    route: "/(voyageur)/moi",
    tickets: ["AM-183", "AM-046"],
  },
  ColisEnvoi: {
    titre: "13 · Envoyer un colis · scan + formulaire en un écran",
    route: "/(voyageur)/colis",
    tickets: ["AM-060"],
  },
  ColisCode: {
    titre: "14 · Colis · code · suivi · photo",
    route: "/(voyageur)/colis/[colisId]",
    tickets: ["AM-061", "AM-183"],
  },
  Relais: {
    titre: "15 · Points relais · carte",
    route: "/(voyageur)/colis/[colisId]/relais",
    tickets: ["AM-062"],
  },
  Livraison: {
    titre: "16 · Livraison moto en cours",
    route: "/(voyageur)/colis/[colisId]/livraison",
    tickets: ["AM-183", "AM-063"],
  },
  Proche: {
    titre: "17 · Payer le voyage d'un proche · depuis l'étranger",
    route: "/(voyageur)/proche",
    tickets: ["AM-044"],
  },
  Guichet: {
    titre: "18 · Guichet — accueil de l'agent (tout à 1 touche)",
    route: "/(guichet)/accueil",
    tickets: ["AM-070"],
  },
  Vente: {
    titre: "19 · Vente en un écran · siège · voyageur · paiement · imprimer",
    route: "/(guichet)/vendre",
    tickets: ["AM-071", "AM-183"],
  },
  Cadence: {
    titre: "20 · Mode cadence (5 h) · 2 touches par billet",
    route: "/(guichet)/cadence",
    tickets: ["AM-072", "AM-183"],
  },
  GuichetColis: {
    titre: "21 · Colis au guichet · étiquette",
    route: "/(guichet)/colis",
    tickets: ["AM-073"],
  },
  Depot: {
    titre: "22 · Dépôt d'un colis prépayé · code",
    route: "/(guichet)/depot",
    tickets: ["AM-074"],
  },
  Quai: {
    titre: "23 · Quai · scan · comptage · soute",
    route: "/(quai)/embarquement",
    tickets: ["AM-080"],
  },
  Convoyeur: {
    titre: "24 · Convoyeur · vente en route",
    route: "/(bus)/convoyeur",
    tickets: ["AM-082", "AM-183"],
  },
  Chauffeur: {
    titre: "25 · Chauffeur · feuille de route · incidents",
    route: "/(bus)/chauffeur",
    tickets: ["AM-083", "AM-183"],
  },
  Controleur: {
    titre: "26 · Contrôleur inopiné",
    route: "/(controle)/inopine",
    tickets: ["AM-084"],
  },
  Caisse: {
    titre: "27 · Caisse · ouverture · fermeture · écart",
    route: "/(guichet)/caisse",
    tickets: ["AM-076"],
  },
  Superviseur: {
    titre: "28 · Superviseur de gare · PIN · annulations",
    route: "/(superviseur)/gare",
    tickets: ["AM-090"],
  },
  RapportSoir: {
    titre: "29 · Rapport du soir · WhatsApp 21 h",
    route: "/(patron)/rapport",
    tickets: ["AM-095"],
  },
  Patron: {
    titre: "30 · Patron — accueil (tout à 1 touche)",
    route: "/(patron)/aujourdhui",
    tickets: ["AM-100"],
  },
  Assistant: {
    titre: "31 · L'assistant du patron",
    route: "/(patron)/assistant",
    tickets: ["AM-104"],
  },
  Analyses: {
    titre: "32 · Analyses · semaine · lignes · bus",
    route: "/(patron)/analyses",
    tickets: ["AM-106"],
  },
  Comptable: {
    titre: "33 · Comptable · exports · rapprochement",
    route: "/(patron)/comptable",
    tickets: ["AM-110"],
  },
  Config: {
    titre: "34 · Configuration · lignes · tarifs · équipe",
    route: "/(patron)/reglages",
    tickets: ["AM-120"],
  },
  Modules: {
    titre: "35 · Modules · activer ou masquer (les 12)",
    route: "/(patron)/reglages/modules",
    tickets: ["AM-125"],
  },
  Financement: {
    titre: "36 · Financement · avance · crédit matériel · salaires",
    route: "/(patron)/financement",
    tickets: ["AM-130"],
  },
  InterAgences: {
    titre: "37 · Colis entre compagnies · correspondance",
    route: "/(patron)/inter-agences",
    tickets: ["AM-132"],
  },
  RelaisApp: { titre: "38 · App du point relais", route: "/(relais)/accueil", tickets: ["AM-140"] },
  Livreur: {
    titre: "39 · App du livreur moto",
    route: "/(livreur)/accueil",
    tickets: ["AM-183", "AM-144"],
  },
  Conducteur: {
    titre: "40 · Conducteur covoiturage",
    route: "/(voyageur)/covoit/proposer",
    tickets: ["AM-053"],
  },
  Vendeur: {
    titre: "41 · Vendeur ambulant · commission",
    route: "/(vendeur)/accueil",
    tickets: ["AM-147"],
  },
  Controle: { titre: "42 · Salle de contrôle (web)", route: "/controle", tickets: ["AM-150"] },
  Parcours: {
    titre: "43 · Parcours en 3 touches — chaque case ouvre son écran",
    route: null,
    tickets: ["AM-009", "AM-180"],
  },
  Systeme: {
    titre: "44 · Système v3 · polices · couleurs · composants",
    route: null,
    tickets: ["AM-003", "AM-005", "AM-007"],
  },
  CadenceBillet: {
    titre: "20b · Cadence · la suite : billet imprimé, numéro, siège, caisse, SMS",
    route: "/(guichet)/cadence/vendu",
    tickets: ["AM-072"],
  },
  CadenceQuai: {
    titre: "20c · Cadence · au quai : scan, nom et pièce complétés, embarquement",
    route: "/(quai)/completer",
    tickets: ["AM-081"],
  },
  SuperviseurValider: {
    titre: "28b · Superviseur · valider une clôture avec le PIN",
    route: "/(superviseur)/cloture/[sessionId]",
    tickets: ["AM-091"],
  },
  SuperviseurVoir: {
    titre: "28c · Superviseur · voir et décider une annulation avec le PIN",
    route: "/(superviseur)/annulation/[demandeId]",
    tickets: ["AM-092"],
  },
  SuperviseurEquipe: {
    titre: "28d · Superviseur · équipe, PIN, comptes",
    route: "/(superviseur)/equipe",
    tickets: ["AM-093", "AM-183"],
  },
  SuperviseurDebloquer: {
    titre: "28e · Superviseur · débloquer un guichet hors ligne depuis 12 h",
    route: "/(superviseur)/debloquer/[appareilId]",
    tickets: ["AM-094"],
  },
  AssistantReponse: {
    titre: "31b · L’assistant répond · pourquoi Bafoussam baisse",
    route: "/(patron)/assistant/reponse",
    tickets: ["AM-105"],
  },
  AnalysesLigne: {
    titre: "32b · Analyses · une ligne en détail",
    route: "/(patron)/analyses/ligne/[ligneId]",
    tickets: ["AM-107"],
  },
  AnalysesBus: {
    titre: "32c · Analyses · un bus en détail",
    route: "/(patron)/analyses/bus/[busId]",
    tickets: ["AM-108"],
  },
  ConfigLigne: {
    titre: "34b · Configuration · modifier une ligne",
    route: "/(patron)/reglages/ligne/[ligneId]",
    tickets: ["AM-121"],
  },
  ComptableRapprochement: {
    titre: "33b · Comptable · 4 transactions MoMo sans correspondance",
    route: "/(patron)/comptable/rapprochement",
    tickets: ["AM-111"],
  },
  ComptableApercu: {
    titre: "33c · Comptable · aperçu d’un export (pop-up)",
    route: "/(patron)/comptable/apercu/[exportId]",
    tickets: ["AM-112"],
  },
  ComptableCloture: {
    titre: "33d · Comptable · décembre clôturé · envoyé au cabinet",
    route: "/(patron)/comptable/cloture",
    tickets: ["AM-113"],
  },
  FinancementDemande: {
    titre: "36b · Financement · dossier envoyé · suivi",
    route: "/(patron)/financement/demande/[dossierId]",
    tickets: ["AM-131"],
  },
  InterAgencesConvention: {
    titre: "37b · Convention Alpha – Oméga",
    route: "/(patron)/inter-agences/convention/[conventionId]",
    tickets: ["AM-133"],
  },
  PatronEquipe: {
    titre: "30b · Patron · mes gares, mes gens",
    route: "/(patron)/gares",
    tickets: ["AM-101"],
  },
  PatronGare: {
    titre: "30c · Patron · une gare en détail",
    route: "/(patron)/gares/[gareId]",
    tickets: ["AM-102"],
  },
  PatronPersonne: {
    titre: "30d · Patron · une personne de l’équipe",
    route: "/(patron)/personnes/[personneId]",
    tickets: ["AM-103"],
  },
  ConfigEquipeListe: {
    titre: "34c · Réglages · la liste de l’équipe (pop-up, filtre par rôle)",
    route: "/(patron)/reglages/equipe",
    tickets: ["AM-122"],
  },
  ConfigPersonne: {
    titre: "34d · Réglages · modifier ou ajouter une personne",
    route: "/(patron)/reglages/personne/[personneId]",
    tickets: ["AM-123"],
  },
  ConfigRegles: {
    titre: "34e · Réglages · modifier une règle",
    route: "/(patron)/reglages/regles",
    tickets: ["AM-124"],
  },
  RelaisDevenir: {
    titre: "22b · Devenir point de relais · programme ouvert (app voyageur)",
    route: "/(voyageur)/moi/devenir-relais",
    tickets: ["AM-141"],
  },
  RelaisInscription: {
    titre: "22c · Devenir point de relais · la fiche en 3 min",
    route: "/(voyageur)/moi/devenir-relais/fiche",
    tickets: ["AM-142"],
  },
  RelaisVerification: {
    titre: "22d · Devenir point de relais · vérification · activation",
    route: "/(voyageur)/moi/devenir-relais/suivi",
    tickets: ["AM-143"],
  },
  LivreurDevenir: {
    titre: "23b · Devenir livreur · programme ouvert · particularités",
    route: "/(voyageur)/moi/devenir-livreur",
    tickets: ["AM-145"],
  },
  LivreurVerification: {
    titre: "23c · Devenir livreur · vérification · première course",
    route: "/(voyageur)/moi/devenir-livreur/suivi",
    tickets: ["AM-146"],
  },
} as const satisfies Record<string, InfoPlanche>;

export type NomPlanche = keyof typeof PLANCHES;
export const NOMS_PLANCHES = Object.keys(PLANCHES) as NomPlanche[];
