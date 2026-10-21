/**
 * Les écrans du service USSD *123#. Une seule source pour les écrans envoyés aux téléphones et pour
 * l'aperçu « Sans internet » de l'application : ils ne peuvent pas dériver l'un de l'autre.
 *
 * Écrans repris de la planche « USSD » (`docs/maquettes-v3/USSD.dc.html`, fixtures `ecrans/USSD.ts`),
 * mot pour mot : le menu, la liste des départs, « Place : n » et « Payer MoMo ? ». Tout le reste
 * (erreurs, aide, colis, billet, bus…) est écrit ici faute de maquette : voir `TEXTES_INVENTES`.
 *
 * Contraintes de l'USSD : pas d'accent (alphabet GSM réduit des vieux téléphones), au plus 160
 * caractères par écran (`LONGUEUR_ECRAN_MAX`), des chiffres comme seules réponses.
 */

export const LONGUEUR_ECRAN_MAX = 160;

/** Les touches du clavier de l'aperçu. */
export const TOUCHES_CLAVIER: readonly string[] = ["1", "2", "3", "4", "5", "6", "*", "0", "#"];

/** Le menu principal, ligne à ligne (planche : « AfriMove », « 1 Billet »… « 0 Aide »). */
export const LIGNES_MENU: readonly string[] = [
  "AfriMove",
  "1 Billet",
  "2 Mon billet",
  "3 Colis",
  "4 Suivre bus",
  "5 Proche",
  "0 Aide",
];

/** Invite sous le menu ; la planche montre la réponse tapée à la suite (« Repondre: 1 »). */
export const INVITE_REPONSE = "Repondre:";

export const SEPARATEUR_APERCU = "--------";

/** Phrase sous l'écran dans l'aperçu (planche). */
export const NOTE_APERCU =
  "3 réponses = un billet. Le SMS arrive avec le code à 4 chiffres. Même règles, mêmes prix, zéro frais en plus.";

/** Mot-clé WhatsApp et légende vocale de l'aperçu (planche) ; la conversation réelle est celle d'AM-168. */
export const MOT_CLE_WHATSAPP = "billet";
export const LEGENDE_VOCAL =
  "Vocal accepté : « je veux aller à Yaoundé demain ». Réponse en français, en anglais ou en pidgin.";
export const ECHANGES_WHATSAPP_APERCU: readonly {
  de: "voyageur" | "afrimove";
  lignes: string[];
}[] = [
  { de: "voyageur", lignes: ["Billet Douala Yaoundé demain matin"] },
  {
    de: "afrimove",
    lignes: [
      "3 départs demain :",
      "1 · 08:00 Bêta VIP 7 500",
      "2 · 08:30 Alpha 4 000",
      "3 · 09:30 Oméga 3 800",
      "Réponds 1, 2 ou 3.",
    ],
  },
  { de: "voyageur", lignes: ["2"] },
  {
    de: "afrimove",
    lignes: ["Alpha 08:30, siège 7 fenêtre. 4 000 F par MoMo ?", "Oui · Changer de siège"],
  },
  {
    de: "afrimove",
    lignes: ["✓ Payé. Billet ALP-DLA-270106-0031, code 5582. Bon voyage, Aïcha."],
  },
];

/* ------------------------------------------------------------------ mise en forme */

/** Retire les accents et les signes hors ASCII (« Yaoundé » → « Yaounde »). */
export function sansAccents(texte: string): string {
  return texte
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/[’‘]/g, "'")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x20-\x7e\n]/g, "");
}

/** Premier mot du nom de la compagnie, sans accent : « Bêta Voyages » → « Beta ». */
export function compagnieCourte(nom: string): string {
  const mot = sansAccents(nom).trim().split(/\s+/)[0] ?? "";
  return mot.slice(0, 12);
}

/** Écran de 160 caractères au plus : ce qui dépasse est coupé à la dernière ligne entière. */
export function ajusterEcran(lignes: readonly string[]): string {
  let texte = lignes.join("\n");
  if (texte.length <= LONGUEUR_ECRAN_MAX) return texte;
  const gardees = [...lignes];
  while (gardees.length > 1 && texte.length > LONGUEUR_ECRAN_MAX) {
    gardees.pop();
    texte = gardees.join("\n");
  }
  return texte.slice(0, LONGUEUR_ECRAN_MAX);
}

/* ------------------------------------------------------------------ écrans de la planche */

/** Le menu, avec l'invite de réponse (planche : une ligne vide avant « Repondre: »). */
export function ecranMenu(): string {
  return ajusterEcran([...LIGNES_MENU, "", INVITE_REPONSE]);
}

export interface LigneDepartUssd {
  /** Heure de départ « HH:MM », heure de Douala. */
  heure: string;
  compagnie: string;
  vip: boolean;
  prix: number;
}

/** Une ligne de la liste (planche : « 1 08:00 Beta VIP 7500 », « 2 08:30 Alpha 4000 »). */
export function ligneDepart(rang: number, d: LigneDepartUssd): string {
  return `${rang} ${d.heure} ${compagnieCourte(d.compagnie)}${d.vip ? " VIP" : ""} ${d.prix}`;
}

/** La liste des départs (planche : « Douala>Yaounde » puis une ligne par départ). */
export function ecranDeparts(
  depart: string,
  arrivee: string,
  departs: readonly LigneDepartUssd[],
  suffixe = "",
): string {
  return ajusterEcran([
    `${sansAccents(depart)}>${sansAccents(arrivee)}${suffixe}`,
    ...departs.map((d, i) => ligneDepart(i + 1, d)),
  ]);
}

/** Le siège attribué et la demande de paiement (planche : « Place: 2 », « Payer MoMo? 1=oui »). */
export function ecranConfirmation(place: number): string {
  return ajusterEcran([`Place: ${place}`, "Payer MoMo? 1=oui"]);
}

/**
 * L'écran de la planche, tel qu'envoyé dans l'aperçu : le menu avec la réponse tapée, un séparateur,
 * puis les écrans suivants d'un achat. Les lignes sont celles du fixture de la planche.
 */
export function lignesApercu(): string[] {
  return [
    ...LIGNES_MENU,
    `${INVITE_REPONSE} 1`,
    SEPARATEUR_APERCU,
    ...ecranDeparts("Douala", "Yaoundé", [
      { heure: "08:00", compagnie: "Bêta", vip: true, prix: 7500 },
      { heure: "08:30", compagnie: "Alpha", vip: false, prix: 4000 },
      { heure: "09:30", compagnie: "Oméga", vip: false, prix: 3800 },
    ]).split("\n"),
    ...ecranConfirmation(2).split("\n"),
  ];
}

/* ------------------------------------------------------------------ textes sans maquette */

export interface BilletUssd {
  numero: string;
  compagnie: string;
  /** « 08:30 » aujourd'hui, « 06/01 08:30 » un autre jour. */
  quand: string;
  depart: string;
  arrivee: string;
  place: number | null;
  code: string;
  /** Autres billets à venir, non montrés. */
  autres: number;
}

export interface BusUssd {
  compagnie: string;
  depart: string;
  arrivee: string;
  /** « HH:MM » ou null. */
  arriveeEstimee: string | null;
  retardMinutes: number;
  prochainArret: string | null;
}

export const ETATS_COLIS_USSD = {
  depose: "Depose",
  charge: "Charge",
  en_route: "En route",
  disponible: "Disponible",
  remis: "Remis",
} as const;
export type EtatColisUssd = keyof typeof ETATS_COLIS_USSD;

/**
 * Textes écrits sans maquette (la planche ne montre que le menu et l'achat). À valider par le
 * produit ; tous sont en ASCII et tiennent dans un écran.
 */
export const TEXTES = {
  invalide: "Choix invalide",
  tropDErreurs: (code: string) => ajusterEcran(["Trop d'erreurs.", `Compose ${code}`]),
  sessionExpiree: (code: string) => ajusterEcran(["Session expiree.", `Compose ${code}`]),
  indisponible: ajusterEcran(["Service indisponible.", "Reessaie plus tard."]),
  compteIndisponible: "Compte indisponible.",
  aide: ajusterEcran([
    "Aide AfriMove",
    "1 pour un billet: suis les ecrans.",
    "Tu peux aussi ecrire billet sur WhatsApp",
    "ou passer au guichet.",
  ]),
  numeroProche: "Numero du proche:",
  numeroProcheInvalide: "Numero invalide (ex: 677012345)",
  numeroColis: "Numero du colis:",
  colisIntrouvable: "Colis introuvable.",
  aucunBillet: "Aucun billet a venir.",
  aucunBus: ajusterEcran(["Pas de bus a suivre.", "Il faut un billet paye."]),
  busSansPosition: ajusterEcran(["Pas de position pour", "le moment. Reessaie plus tard."]),
  aucunDepart: ajusterEcran(["Aucun depart disponible.", "Reessaie plus tard."]),
  departIndisponible: (code: string) => ajusterEcran(["Depart indisponible.", `Compose ${code}`]),
  complet: ajusterEcran(["Plus de place sur", "ce depart."]),
  annule: "Annule.",
  paiementDemande: ajusterEcran([
    "Confirme le paiement",
    "sur ton telephone.",
    "Le SMS arrive avec ton code.",
  ]),
  paiementRefuse: ajusterEcran(["Paiement refuse.", "Reessaie plus tard."]),
  paiementEnCours: ajusterEcran([
    "Un paiement est deja",
    "en cours. Confirme-le",
    "sur ton telephone.",
  ]),
  modeDegrade: ajusterEcran(["Paiement MoMo indisponible.", "Achete ton billet a la gare."]),
  delaiDepasse: (code: string) => ajusterEcran(["Delai depasse.", `Compose ${code}`]),
  demain: " demain",
  billet(b: BilletUssd): string {
    return ajusterEcran([
      `Billet ${b.numero}`,
      `${compagnieCourte(b.compagnie)} ${b.quand}`,
      `${sansAccents(b.depart)}>${sansAccents(b.arrivee)}`,
      ...(b.place !== null ? [`Place: ${b.place}`] : []),
      `Code: ${b.code}`,
      ...(b.autres > 0 ? [`+${b.autres} autre${b.autres > 1 ? "s" : ""}`] : []),
    ]);
  },
  bus(b: BusUssd): string {
    return ajusterEcran([
      `${compagnieCourte(b.compagnie)} ${sansAccents(b.depart)}>${sansAccents(b.arrivee)}`,
      ...(b.arriveeEstimee !== null ? [`Arrivee prevue ${b.arriveeEstimee}`] : []),
      ...(b.retardMinutes > 0 ? [`Retard: ${b.retardMinutes} min`] : []),
      ...(b.prochainArret !== null ? [`Prochain arret: ${sansAccents(b.prochainArret)}`] : []),
    ]);
  },
  colis(numero: string, etat: EtatColisUssd): string {
    return ajusterEcran([`Colis ${sansAccents(numero)}`, ETATS_COLIS_USSD[etat]]);
  },
} as const;

/** Les messages inventés, pour le rapport de livraison et la relecture produit. */
export const TEXTES_INVENTES: readonly string[] = [
  TEXTES.invalide,
  TEXTES.sessionExpiree("*123#"),
  TEXTES.tropDErreurs("*123#"),
  TEXTES.indisponible,
  TEXTES.compteIndisponible,
  TEXTES.aide,
  TEXTES.numeroProche,
  TEXTES.numeroProcheInvalide,
  TEXTES.numeroColis,
  TEXTES.colisIntrouvable,
  TEXTES.aucunBillet,
  TEXTES.aucunBus,
  TEXTES.busSansPosition,
  TEXTES.aucunDepart,
  TEXTES.departIndisponible("*123#"),
  TEXTES.complet,
  TEXTES.annule,
  TEXTES.paiementDemande,
  TEXTES.paiementRefuse,
  TEXTES.paiementEnCours,
  TEXTES.modeDegrade,
  TEXTES.delaiDepasse("*123#"),
];
