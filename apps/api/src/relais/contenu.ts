import { GAIN_REMISE_RELAIS, GAIN_REPRISE_RELAIS, GARDE_RELAIS_JOURS } from "./regles";

/**
 * Textes des pages du programme « point de relais », repris des maquettes
 * (`RelaisDevenir`, `RelaisInscription`, `RelaisVerification`, `Relais`, `RelaisApp`).
 * Les chiffres (relais actifs, villes, gain de la semaine dernière) sont calculés, pas écrits ici.
 */

export const TYPES_BOUTIQUE = [
  "Boutique · alimentation",
  "Pharmacie",
  "Call-box",
  "Quincaillerie",
  "Salon de coiffure",
  "Autre",
] as const;

export const HORAIRES_PROPOSES = [
  "7 h – 20 h · lun.–sam.",
  "7 h – 22 h · 7 j / 7",
  "8 h – 18 h · lun.–ven.",
] as const;

export const TAILLES_PROPOSEES = [
  "Petits et moyens (≤ 10 kg)",
  "Petits seulement (≤ 3 kg)",
  "Tous (≤ 30 kg)",
] as const;

export const PROGRAMME_RELAIS = {
  titre: "Deviens point de relais",
  detail: "Programme ouvert à toute boutique",
  accroche:
    "Ta boutique garde les colis des voyageurs. Tu gagnes à chaque remise, et des clients entrent.",
  deroule:
    "Le bus arrive à la gare, le convoyeur dépose chez toi les colis du quartier. Le destinataire vient avec son code et sa pièce, tu scannes, c'est remis. Payé chaque lundi par MoMo.",
  prerequis: [
    "Une boutique ouverte ≥ 6 j / 7",
    "Ce téléphone (même app)",
    "Ta CNI ou ton récépissé",
    "Un numéro MoMo pour être payé",
    "1 m² à l'abri, fermé la nuit",
    "10 min de formation vidéo",
  ],
  etapes: [
    {
      rang: 1,
      titre: "Tu remplis la fiche · 3 min",
      detail: "nom, position, horaires, photo de la façade, pièce",
    },
    {
      rang: 2,
      titre: "Un agent AfriMove passe sous 72 h",
      detail: "ou appel vidéo · il vérifie et te forme en 10 min",
    },
    {
      rang: 3,
      titre: "Tu reçois ton kit et ton premier colis",
      detail: "affiche QR, étiquettes, code relais R-… · l’app passe en mode relais",
    },
  ],
  mention:
    "Pas d'exclusivité, pas de caution. Tu peux faire une pause (vacances) ou arrêter quand tu veux depuis l'app.",
} as const;

export const FORMULAIRE_RELAIS = {
  titre: "Ta boutique",
  detail: "Étape 1 / 3 · la fiche · tout se corrige après",
  libelles: {
    nom: "Nom de la boutique",
    type: "Type",
    ouvert: "Ouvert",
    position: "Position · détectée",
    taille: "Taille des colis acceptés",
    momo: "MoMo pour être payé",
  },
  piecesFacade: { titre: "Photo de la façade", detail: "pour que les clients te trouvent" },
  pieceIdentite: { detail: "déjà vérifiée à ton inscription AfriMove" },
  engagement: {
    titre: "Tu t’engages à",
    texte:
      "Scanner chaque colis à la réception et à la remise · ne remettre qu'avec le code et la pièce · garder les colis 7 jours à l'abri · ne jamais ouvrir un colis. AfriMove assure la perte jusqu'à 50 000 F par colis dès lors que les scans sont faits.",
  },
  mention: "Tes infos servent à te trouver sur la carte et à te payer. Rien d'autre.",
  etape: { courante: 1, total: 3 },
} as const;

/** Réponse à l'envoi de la fiche (« un agent te rappelle sous 72 h »). */
export const SUITE_FICHE_RELAIS = "un agent te rappelle sous 72 h";

export const SUIVI_RELAIS = {
  titre: "Fiche envoyée",
  detail: (dossier: string): string => `Étape 2 / 3 · vérification · dossier ${dossier}`,
  jalons: {
    fiche: { libelle: "Fiche reçue", detail: "SMS de confirmation envoyé" },
    position: {
      libelle: "Position et horaires validés",
      detail: "la boutique est bien sur un trajet de convoyeur",
    },
    agent: {
      libelle: "Agent AfriMove · visite ou appel vidéo",
      detail: "il vérifie la façade, l’abri, et te forme (10 min)",
    },
    activation: {
      libelle: "Activation",
      detail: "code relais, kit (affiche QR + 50 étiquettes), app en mode relais",
    },
    premierColis: {
      libelle: "Premier colis",
      detail: `le convoyeur te prévient la veille · tu scannes · ${GAIN_REMISE_RELAIS} F`,
    },
  },
  reservation: { libelle: "Ton code relais · réservé", activation: "actif après la visite" },
  demo: {
    libelle: "En attendant",
    titre: "Essayer l'app relais · démo",
    detail: "recevoir · remettre · payé lundi →",
  },
  recit: {
    titre: "Étape 3 · à quoi ressemble la visite",
    texte: (agent: string, boutique: string, quartier: string): string =>
      `${agent} scanne ta fiche, colle l'affiche QR à ta vitrine, te montre les 2 gestes (scanner à la réception, code + pièce à la remise) et active ton compte devant toi. Dès le soir, les voyageurs qui envoient un colis à ${quartier} voient « ${boutique} » dans la liste des relais.`,
  },
  mention:
    "Tu peux modifier ta fiche, déplacer la visite ou retirer ta demande à tout moment. Rien n'est facturé.",
} as const;

/** Page « Points relais · <ville> » vue par l'expéditeur. */
export const RELAIS_PROCHES = {
  devenir: {
    titre: `Ta boutique ici ? Deviens point de relais · ${GAIN_REMISE_RELAIS} F par colis`,
    detail:
      "Le relais scanne à la réception et à la remise · code + pièce · 7 jours de garde inclus",
  },
} as const;

/** Consigne affichée pendant la remise (« Remise en cours »). */
export const CONSIGNE_REMISE_RELAIS =
  "Ne pas photographier la pièce. Photo du colis remis à la fin.";

export { GAIN_REPRISE_RELAIS, GARDE_RELAIS_JOURS };
