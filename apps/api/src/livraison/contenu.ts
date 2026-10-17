import { ATTENTE_ABSENCE_MINUTES, DELAI_ACCEPTATION_SECONDES, SEUIL_RETRAIT } from "./regles";

/**
 * Textes des pages du livreur et de la livraison, repris des maquettes (`Livreur`, `Livraison`,
 * `LivreurDevenir`, `LivreurVerification`). Les chiffres (livreurs actifs, villes, gains) sont
 * calculés, pas écrits ici.
 */

export const DEPLACEMENTS_PROPOSES = ["Moto", "Vélo", "À pied", "Tricycle · gros colis"] as const;

export const ZONES_PROPOSEES = [
  "Bafoussam · Tamdja, Djeleng, centre",
  "Bafoussam · toute la ville",
  "Douala · Akwa, Bonanjo",
  "Yaoundé · Mvan, Biyem-Assi",
] as const;

export const HEURES_PROPOSEES = [
  "Soirs 17 h – 21 h",
  "Toute la journée",
  "Matins 6 h – 12 h",
  "Week-ends",
] as const;

export const CHARGES_PROPOSEES = [
  "10 kg · colis courants",
  "3 kg · petits colis",
  "30 kg · gros colis (tricycle)",
] as const;

export const PROGRAMME_LIVREUR = {
  titre: "Deviens livreur",
  detail: "Programme ouvert · moto, vélo ou à pied · tu choisis tes heures",
  particularites: {
    titre: "Tes particularités · on te propose les bonnes courses",
    deplacement: "Je me déplace",
    zone: "Ma zone",
    heures: "Mes heures",
    charge: "Je porte jusqu’à",
    momo: "MoMo pour être payé",
  },
  pieces: [
    { titre: "CNI", detail: "déjà vérifiée" },
    { titre: "Permis A", detail: "photo · si moto" },
    { titre: "Assurance moto", detail: "photo · si moto" },
  ],
  regles: {
    titre: "Les 3 règles · tu les signes",
    texte:
      "1. Jamais de remise sans le code. 2. Jamais de code demandé par téléphone. 3. Photo du colis remis, à chaque fois. Le colis est assuré jusqu'à 50 000 F dès que tu scannes.",
  },
  mention: `Pas d'exclusivité : tu acceptes ou passes chaque course. ${DELAI_ACCEPTATION_SECONDES} s pour répondre, puis elle va au suivant.`,
} as const;

/** Réponse au dépôt de la demande : la formation dure 10 minutes. */
export const SUITE_DEMANDE_LIVREUR = "pièces · 10 min de formation · 1re course";

export const SUIVI_LIVREUR = {
  titre: "Demande envoyée",
  jalons: {
    fiche: { libelle: "Fiche reçue", detail: "SMS de confirmation" },
    identite: { libelle: "CNI et MoMo au même nom", detail: "vérifiés par l'agent" },
    pieces: {
      libelle: "Permis et assurance",
      detail: "l'agent les regarde à la gare ou lit les photos",
    },
    formation: {
      libelle: "Formation · 10 min en vidéo",
      detail: "les 3 règles, le scan, la remise contre code · quiz de 5 questions",
    },
    activation: (numero: number): string =>
      `l'app passe en mode livreur · tu reçois ta première course dans ta zone, à tes heures (badge n° ${numero})`,
  },
  badge: { libelle: "Ton badge · réservé", activation: "actif après la formation" },
  demo: {
    libelle: "En attendant",
    titre: "Essayer l'app livreur · démo",
    detail: "mission · accepter · payé le soir →",
  },
  recit: {
    titre: "Ta première soirée · à quoi ça ressemble",
    texte: (gain: number): string =>
      `Dès qu'une course correspond à ta zone, à tes heures et à ta charge, elle apparaît dans l'app : tu as ${DELAI_ACCEPTATION_SECONDES} s pour accepter. Tu scannes le colis au quai, tu roules, le client te donne son code, tu photographies le colis remis. ${gain} F sur ton MoMo le soir même.`,
  },
  complement: { titre: "Tes particularités · modifiables à tout moment" },
} as const;

/** Les règles affichées sur l'écran du livreur. */
export const REGLES_LIVREUR = {
  titre: "Les 3 règles",
  texte: `1. Jamais de remise sans code. 2. Jamais de code demandé par téléphone. 3. Photo du colis remis, jamais de la pièce. Absent : ${ATTENTE_ABSENCE_MINUTES} min, puis relais le plus proche.`,
} as const;

export const LIBELLES_PIECES = {
  permis: { type: "permis", libelle: "Permis" },
  assurance: { type: "assurance-moto", libelle: "Assurance moto" },
  gilet: { type: "gilet-casque", libelle: "Gilet · casque" },
} as const;

/** « Tu as une moto ? Deviens livreur AfriMove », en bas de l'écran de livraison. */
export const DEVENIR_LIVREUR = {
  titre: "Tu as une moto ? Deviens livreur AfriMove",
  detail: (gain: number): string =>
    `${gain} F la course · tu choisis tes heures et ta zone · inscription 3 min`,
} as const;

export const RETRAIT_SEUIL_TEXTE = `Retrait possible dès ${SEUIL_RETRAIT} F`;
