import type { Appareil, Module, Personne, Role } from "@afrimove/domain";
import { heure } from "../horloge";
import { ALPHA, ALPHA_AKWA, ALPHA_BAFOUSSAM, ALPHA_MVAN, BETA, OMEGA } from "./reseau";

/**
 * Les personnes des maquettes. Les numéros sont ceux qui s'affichent (les chiffres masqués par « •• »
 * ou « … » dans les planches sont complétés ici, sans jamais contredire la partie visible).
 */

function personne(
  id: string,
  nom: string,
  telephone: string,
  roles: readonly Role[],
  rattachement: { compagnieId?: string; gareId?: string } = {},
  actif = true,
): Personne {
  return { id: `pers-${id}`, nom, telephone, roles, ...rattachement, actif };
}

/* ------------------------------------------------------------------ voyageurs et proches */

export const AICHA = personne("aicha", "Aïcha Ngo", "+237691221008", ["voyageur"]);
/** « Maman » : Thérèse Ngo, à Bafoussam. */
export const MAMAN = personne("therese", "Thérèse Ngo", "+237699401822", ["voyageur"]);
export const KEVIN = personne("kevin", "Kevin", "+15145550142", ["voyageur"]);
export const PAUL_K = personne("paul-k", "Paul K.", "+237677000040", ["voyageur"]);
export const TCHOUMI_PAUL = personne("tchoumi-paul", "Tchoumi Paul", "+237677301145", ["voyageur"]);
export const ESSOMBA_RACHEL = personne("essomba-rachel", "Essomba Rachel", "+237670330900", [
  "voyageur",
]);
export const NGONO_ALBERTINE = personne("ngono-albertine", "Ngono Albertine", "+237655120000", [
  "voyageur",
]);
export const MBALLA_J = personne("mballa-j", "Mballa J.", "+237655000000", ["voyageur"]);

/* ------------------------------------------------------------------ patrons */

export const KAMGA_PATRON = personne("kamga", "M. Kamga", "+237677000001", ["patron"], {
  compagnieId: ALPHA.id,
});
export const TCHOUA = personne("tchoua", "E. Tchoua", "+237677000002", ["patron"], {
  compagnieId: OMEGA.id,
});

/* ------------------------------------------------------------------ équipe d'Alpha Voyages */

const akwa = { compagnieId: ALPHA.id, gareId: ALPHA_AKWA.id };
const mvan = { compagnieId: ALPHA.id, gareId: ALPHA_MVAN.id };
const bafoussam = { compagnieId: ALPHA.id, gareId: ALPHA_BAFOUSSAM.id };

export const JOSEPH_M = personne("joseph", "Joseph Mbappé", "+237677123423", ["guichetier"], akwa);
export const MARIE_T = personne("marie", "Marie T.", "+237677000011", ["guichetier"], akwa);
export const PAULINE_N = personne("pauline", "Pauline N.", "+237677000012", ["guichetier"], akwa);
export const ESSONO = personne("essono", "Mme Essono", "+237677000013", ["superviseur"], akwa);
export const B_NGO = personne("b-ngo", "B. Ngo", "+237677000014", ["guichetier"], akwa);
export const D_TCHINDA = personne("d-tchinda", "D. Tchinda", "+237677000015", ["guichetier"], mvan);
export const S_ATANGANA = personne(
  "s-atangana",
  "S. Atangana",
  "+237677000016",
  ["guichetier"],
  mvan,
);
export const C_EBOLO = personne("c-ebolo", "C. Ebolo", "+237677000017", ["guichetier"], mvan);
export const O_ESSOMBA = personne(
  "o-essomba",
  "O. Essomba",
  "+237677000018",
  ["superviseur"],
  mvan,
);
/** Superviseur de Mvan cité par le rapport du soir et la salle de contrôle. */
export const TCHINDA_SUP = personne(
  "tchinda-sup",
  "Tchinda",
  "+237677000019",
  ["superviseur"],
  mvan,
);
export const T_KAMGA = personne("t-kamga", "T. Kamga", "+237677000020", ["guichetier"], bafoussam);
/** Superviseur de Bafoussam cité par le rapport du soir et la salle de contrôle. */
export const FOSSO = personne("fosso", "Fosso", "+237677000021", ["superviseur"], bafoussam);
export const L_FOUDA = personne("l-fouda", "L. Fouda", "+237677000022", ["guichetier"], akwa);
export const ALAIN_B = personne("alain-b", "Alain B.", "+237677000023", ["convoyeur"], akwa);
export const MBARGA = personne("mbarga", "Mbarga", "+237677000024", ["chauffeur"], akwa);
export const K_FOTSO = personne("k-fotso", "K. Fotso", "+237677000025", ["chauffeur"], akwa);
export const M_NANA = personne("m-nana", "M. Nana", "+237677000026", ["chauffeur"], akwa);
export const R_MBALLA = personne("r-mballa", "R. Mballa", "+237677000027", ["chauffeur"], akwa);
export const MME_FOUDA = personne("mme-fouda", "Mme Fouda", "+237677000028", ["controleur"], akwa);

/* ------------------------------------------------------------------ partenaires */

export const NADEGE = personne("nadege", "Nadège", "+237677000031", ["vendeur"], {
  compagnieId: ALPHA.id,
});
export const ERIC_T = personne("eric-t", "Éric T.", "+237675000009", ["livreur"]);
export const MAMA_FOTSO = personne("mama-fotso", "Mama Fotso", "+237699000041", ["relais"]);
export const SAMUEL_E = personne("samuel-e", "Samuel E.", "+237677000051", ["voyageur"]);
export const JEAN_K = personne("jean-k", "Jean K.", "+237677000052", ["voyageur"]);
export const AGENT_PAUL_K = personne("agent-paul-k", "Paul K.", "+237677000053", ["afrimove"]);
export const BETA_PATRON = personne(
  "beta-patron",
  "Patron Bêta Express",
  "+237677000054",
  ["patron"],
  {
    compagnieId: BETA.id,
  },
);

export const PERSONNES: readonly Personne[] = [
  AICHA,
  MAMAN,
  KEVIN,
  PAUL_K,
  TCHOUMI_PAUL,
  ESSOMBA_RACHEL,
  NGONO_ALBERTINE,
  MBALLA_J,
  KAMGA_PATRON,
  TCHOUA,
  JOSEPH_M,
  MARIE_T,
  PAULINE_N,
  ESSONO,
  B_NGO,
  D_TCHINDA,
  S_ATANGANA,
  C_EBOLO,
  O_ESSOMBA,
  TCHINDA_SUP,
  T_KAMGA,
  FOSSO,
  L_FOUDA,
  ALAIN_B,
  MBARGA,
  K_FOTSO,
  M_NANA,
  R_MBALLA,
  MME_FOUDA,
  NADEGE,
  ERIC_T,
  MAMA_FOTSO,
  SAMUEL_E,
  JEAN_K,
  AGENT_PAUL_K,
  BETA_PATRON,
];

/* ------------------------------------------------------------------ appareils */

/** Téléphone du guichet 3 d'Akwa, hors ligne depuis 12 h 40 sur la planche « Débloquer ». */
export const APPAREIL_GU3_DLA: Appareil = {
  id: "appareil-gu3-dla",
  type: "telephone_guichet",
  gareId: ALPHA_AKWA.id,
  guichetId: "guichet-alp-dla-3",
  derniereSyncA: "2027-01-05T01:20:00.000+01:00",
};

export const APPAREIL_GU2_DLA: Appareil = {
  id: "appareil-gu2-dla",
  type: "telephone_guichet",
  gareId: ALPHA_AKWA.id,
  guichetId: "guichet-alp-dla-2",
  derniereSyncA: heure("14:00"),
};

/* ------------------------------------------------------------------ modules */

/**
 * Les 12 modules de la planche « Modules » ; 10 sur 12 actifs chez Alpha (covoiturage/vendeurs et
 * financement sont éteints).
 */
export const MODULES: readonly Module[] = [
  { code: "guichet_caisse", nom: "Guichet et caisse", actif: true },
  { code: "colis", nom: "Colis", actif: true },
  { code: "quai_bus", nom: "Quai, convoyeur, chauffeur", actif: true },
  { code: "supervision", nom: "Supervision, rapport, assistant", actif: true },
  { code: "voyageur", nom: "Voyageur · app, web, WhatsApp", actif: true },
  { code: "ussd", nom: "USSD *123#", actif: true },
  { code: "relais", nom: "Points relais", actif: true },
  { code: "livraison_moto", nom: "Livraison moto", actif: true },
  { code: "inter_agences", nom: "Inter-agences et réseau", actif: true },
  { code: "covoit_vendeurs", nom: "Covoiturage et vendeurs ambulants", actif: false },
  { code: "financement", nom: "Financement et crédit", actif: false },
  { code: "fidelite", nom: "Fidélité et parrainage", actif: true },
];
