import type { Arret, Bus, Compagnie, Gare, Guichet, Ligne, TarifsLigne } from "@afrimove/domain";

/**
 * Le réseau des maquettes : 5 compagnies, leurs gares (Akwa, Mvan, Bafoussam…), leurs lignes et
 * leurs bus. Les identifiants sont lisibles (`cie-alp`, `gare-alp-dla`, `bus-lt412ab`…) pour que les
 * écrans et les tests restent faciles à lire ; le domaine les traite comme opaques.
 */

/* ------------------------------------------------------------------ compagnies */

function compagnie(code: string, nom: string): Compagnie {
  return { id: `cie-${code.toLowerCase()}`, code, nom, actif: true };
}

export const ALPHA = compagnie("ALP", "Alpha Voyages");
export const BETA = compagnie("BEX", "Bêta Express");
export const OMEGA = compagnie("OME", "Oméga Transports");
export const GENERAL = compagnie("GEX", "Général Express");
export const TOURISTIQUE = compagnie("TEX", "Touristique Express");

export const COMPAGNIES: readonly Compagnie[] = [ALPHA, BETA, OMEGA, GENERAL, TOURISTIQUE];

/* ------------------------------------------------------------------ gares */

function gare(cie: Compagnie, code: string, nom: string, ville: string): Gare {
  return {
    id: `gare-${cie.code.toLowerCase()}-${code.toLowerCase()}`,
    compagnieId: cie.id,
    code,
    nom,
    ville,
  };
}

export const ALPHA_AKWA = gare(ALPHA, "DLA", "Douala Akwa", "Douala");
export const ALPHA_MVAN = gare(ALPHA, "YDE", "Yaoundé Mvan", "Yaoundé");
export const ALPHA_BAFOUSSAM = gare(ALPHA, "BAF", "Bafoussam", "Bafoussam");
export const BETA_AKWA = gare(BETA, "DLA", "Douala Akwa", "Douala");
export const BETA_MVAN = gare(BETA, "YDE", "Yaoundé Mvan", "Yaoundé");
export const OMEGA_AKWA = gare(OMEGA, "DLA", "Douala Akwa", "Douala");
export const OMEGA_MVAN = gare(OMEGA, "YDE", "Yaoundé Mvan", "Yaoundé");
export const OMEGA_BAFOUSSAM = gare(OMEGA, "BAF", "Bafoussam", "Bafoussam");
export const OMEGA_BAMENDA = gare(OMEGA, "BAM", "Bamenda", "Bamenda");
export const GENERAL_AKWA = gare(GENERAL, "DLA", "Douala Akwa", "Douala");
export const GENERAL_MVAN = gare(GENERAL, "YDE", "Yaoundé Mvan", "Yaoundé");
export const TOURISTIQUE_AKWA = gare(TOURISTIQUE, "DLA", "Douala Akwa", "Douala");
export const TOURISTIQUE_MVAN = gare(TOURISTIQUE, "YDE", "Yaoundé Mvan", "Yaoundé");

export const GARES: readonly Gare[] = [
  ALPHA_AKWA,
  ALPHA_MVAN,
  ALPHA_BAFOUSSAM,
  BETA_AKWA,
  BETA_MVAN,
  OMEGA_AKWA,
  OMEGA_MVAN,
  OMEGA_BAFOUSSAM,
  OMEGA_BAMENDA,
  GENERAL_AKWA,
  GENERAL_MVAN,
  TOURISTIQUE_AKWA,
  TOURISTIQUE_MVAN,
];

/* ------------------------------------------------------------------ guichets */

function guichet(g: Gare, rang: number): Guichet {
  return {
    id: `guichet-${g.compagnieId.slice(4)}-${g.code.toLowerCase()}-${rang}`,
    gareId: g.id,
    rang,
  };
}

/** Akwa : 3 guichets ; Mvan : 2 ; Bafoussam : 1 (planche « Mes gares, mes gens »). */
export const GUICHETS: readonly Guichet[] = [
  guichet(ALPHA_AKWA, 1),
  guichet(ALPHA_AKWA, 2),
  guichet(ALPHA_AKWA, 3),
  guichet(ALPHA_MVAN, 1),
  guichet(ALPHA_MVAN, 2),
  guichet(ALPHA_BAFOUSSAM, 1),
];

export function guichetAlpha(gareCode: "DLA" | "YDE" | "BAF", rang: number): Guichet {
  const g = GUICHETS.find(
    (x) => x.gareId === `gare-alp-${gareCode.toLowerCase()}` && x.rang === rang,
  );
  if (!g) throw new RangeError(`Guichet inconnu : ${gareCode} ${rang}`);
  return g;
}

/* ------------------------------------------------------------------ lignes */

function arret(nom: string, km: number, montee = true): Arret {
  return {
    id: `arret-${nom
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z]+/g, "")}`,
    nom,
    kmDepuisOrigine: km,
    montee,
  };
}

const DLA_YDE_ARRETS: readonly Arret[] = [
  arret("Douala Akwa", 0),
  arret("Edéa", 65),
  arret("Pouma", 96),
  arret("Boumnyebel", 150),
  arret("Yaoundé Mvan", 240),
];

function ligne(
  cie: Compagnie,
  origine: Gare,
  destination: Gare,
  arrets: readonly Arret[],
  tarifs: TarifsLigne,
): Ligne {
  const code = origine.code + destination.code;
  return {
    id: `ligne-${cie.code.toLowerCase()}-${code.toLowerCase()}`,
    compagnieId: cie.id,
    code,
    origineGareId: origine.id,
    destinationGareId: destination.id,
    arrets,
    tarifs,
  };
}

/** Réglages : Douala → Yaoundé classique 4 000, VIP 5 500, bagage 1 000. */
export const ALPHA_DLA_YDE = ligne(ALPHA, ALPHA_AKWA, ALPHA_MVAN, DLA_YDE_ARRETS, {
  classique: 4000,
  vip: 5500,
  bagage: 1000,
});
/** Bêta Express : le VIP à 7 500 de l'accueil ; le classique n'est pas affiché (choix de fixtures). */
export const BETA_DLA_YDE = ligne(BETA, BETA_AKWA, BETA_MVAN, DLA_YDE_ARRETS, {
  classique: 5000,
  vip: 7500,
  bagage: 1000,
});
/** Oméga : le classique à 3 800 de l'accueil ; le VIP n'est pas affiché (choix de fixtures). */
export const OMEGA_DLA_YDE = ligne(OMEGA, OMEGA_AKWA, OMEGA_MVAN, DLA_YDE_ARRETS, {
  classique: 3800,
  vip: 5800,
  bagage: 1000,
});
/** Réglages : Douala → Bafoussam 3 500, VIP 5 000, arrêts Bafang et Mbouda (prorata 2 000 et 2 800). */
export const ALPHA_DLA_BAF = ligne(
  ALPHA,
  ALPHA_AKWA,
  ALPHA_BAFOUSSAM,
  [arret("Douala Akwa", 0), arret("Bafang", 143), arret("Mbouda", 200), arret("Bafoussam", 250)],
  { classique: 3500, vip: 5000, bagage: 1000 },
);
/** Réglages : Yaoundé → Bafoussam 4 500, prix en route au prorata. */
export const ALPHA_YDE_BAF = ligne(
  ALPHA,
  ALPHA_MVAN,
  ALPHA_BAFOUSSAM,
  [arret("Yaoundé Mvan", 0), arret("Bafoussam", 290)],
  { classique: 4500, vip: 6500, bagage: 1000 },
);
export const OMEGA_DLA_BAF = ligne(
  OMEGA,
  OMEGA_AKWA,
  OMEGA_BAFOUSSAM,
  [arret("Douala Akwa", 0), arret("Bafoussam", 250)],
  { classique: 3000, vip: 4500, bagage: 1000 },
);

export const LIGNES: readonly Ligne[] = [
  ALPHA_DLA_YDE,
  BETA_DLA_YDE,
  OMEGA_DLA_YDE,
  ALPHA_DLA_BAF,
  ALPHA_YDE_BAF,
  OMEGA_DLA_BAF,
];

/* ------------------------------------------------------------------ bus */

function bus(
  cie: Compagnie,
  immatriculation: string,
  capacite: number,
  classe: "classique" | "vip" = "classique",
): Bus {
  return {
    id: `bus-${immatriculation.toLowerCase().replace(/ /g, "")}`,
    compagnieId: cie.id,
    immatriculation,
    capacite,
    classe,
  };
}

/**
 * La flotte d'Alpha vue dans « Analyses » (14 bus annoncés, 7 nommés). LT 412 AB a 40 places au
 * quai ; les autres planches donnent 36 ou 30 (voir INCOHERENCES.md).
 */
export const BUS_LT412 = bus(ALPHA, "LT 412 AB", 40);
export const BUS_LT118 = bus(ALPHA, "LT 118 AB", 40);
export const BUS_LT207 = bus(ALPHA, "LT 207 AB", 30);
export const BUS_LT330 = bus(ALPHA, "LT 330 AB", 40);
export const BUS_LT095 = bus(ALPHA, "LT 095 AB", 40);
export const BUS_LT261 = bus(ALPHA, "LT 261 AB", 40);
export const BUS_LT148 = bus(ALPHA, "LT 148 AB", 40);
export const BUS_OMEGA_OU302 = bus(OMEGA, "OU 302 NW", 40);

export const BUS: readonly Bus[] = [
  BUS_LT412,
  BUS_LT118,
  BUS_LT207,
  BUS_LT330,
  BUS_LT095,
  BUS_LT261,
  BUS_LT148,
  BUS_OMEGA_OU302,
];
