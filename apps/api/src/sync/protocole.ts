import { TYPES_EVENEMENT, TYPES_NUMEROTES, TYPES_SIEGE_OCCUPE } from "./regles";

/**
 * Protocole de `POST /sync/evenements` (miroir de `packages/sync/src/protocole.ts`).
 *
 * Le serveur ne fait pas confiance au corps : chaque événement est validé un par un et un
 * événement invalide est refusé **seul** (le reste du lot passe). Une vente déjà imprimée ne doit
 * jamais être perdue à cause d'un voisin malformé.
 */

export const TAILLE_LOT_MAX = 100;

export const CODES_REJET = [
  "enveloppe_invalide",
  "type_inconnu",
  "donnees_invalides",
  "signature_invalide",
  "auteur_incoherent",
  "role_non_autorise",
  "appareil_incoherent",
] as const;
export type CodeRejet = (typeof CODES_REJET)[number];

export const TYPES_CIBLE_SYNC = [
  "billet",
  "colis",
  "depart",
  "session",
  "appareil",
  "personne",
  "demande",
  "controle",
] as const;

/** Un événement après validation de son enveloppe. */
export interface EvenementRecu {
  id: string;
  type: string;
  /** ISO Douala tel que reçu (la signature porte sur ce texte). */
  at: string;
  appareilId: string;
  auteurId: string;
  cible: { type: string; id: string };
  numeroPlage: number | null;
  donnees: Record<string, unknown>;
}

/** Une ligne du journal : un événement d'appareil, ou un événement produit par le serveur (sans appareil ni auteur). */
export interface EvenementJournal extends Omit<EvenementRecu, "appareilId" | "auteurId"> {
  appareilId: string | null;
  auteurId: string | null;
}

export interface LigneLotRecue {
  ordre: number;
  evenement: unknown;
  signature: unknown;
}

export interface LotRecu {
  appareilId: string;
  envoyeA: string;
  evenements: LigneLotRecue[];
}

export class LotInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LotInvalide";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DOUALA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/;

const estObjet = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const estTexte = (v: unknown, max = 200): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;

/** Valide la forme du lot (pas son contenu) : une erreur ici est un 400 pour tout le lot. */
export function lireLot(corps: unknown): LotRecu {
  if (!estObjet(corps)) throw new LotInvalide("Corps JSON attendu");
  const { appareilId, envoyeA, evenements } = corps;
  if (!estTexte(appareilId, 128)) throw new LotInvalide("appareilId manquant");
  if (typeof envoyeA !== "string" || Number.isNaN(Date.parse(envoyeA))) {
    throw new LotInvalide("envoyeA : date ISO attendue");
  }
  if (!Array.isArray(evenements)) throw new LotInvalide("evenements : liste attendue");
  if (evenements.length > TAILLE_LOT_MAX) {
    throw new LotInvalide(
      `Lot trop gros : ${evenements.length} événements (maximum ${TAILLE_LOT_MAX})`,
    );
  }
  const lignes: LigneLotRecue[] = evenements.map((ligne, i) => {
    if (!estObjet(ligne)) throw new LotInvalide(`evenements[${i}] : objet attendu`);
    const { ordre, evenement, signature } = ligne;
    if (typeof ordre !== "number" || !Number.isInteger(ordre) || ordre < 1) {
      throw new LotInvalide(`evenements[${i}].ordre : entier ≥ 1 attendu`);
    }
    return { ordre, evenement, signature };
  });
  return { appareilId, envoyeA, evenements: lignes };
}

export type ResultatValidation =
  | { ok: true; evenement: EvenementRecu }
  | { ok: false; code: CodeRejet; message: string };

const echec = (code: CodeRejet, message: string): ResultatValidation => ({
  ok: false,
  code,
  message,
});

/** Valide l'enveloppe d'un événement et, pour les types connus, les champs dont le serveur se sert. */
export function validerEvenement(brut: unknown): ResultatValidation {
  if (!estObjet(brut)) return echec("enveloppe_invalide", "Événement : objet attendu");
  const { id, type, at, appareilId, auteurId, cible, numeroPlage, donnees } = brut;
  if (typeof id !== "string" || !UUID.test(id)) {
    return echec("enveloppe_invalide", "id : UUID attendu");
  }
  if (typeof type !== "string") return echec("enveloppe_invalide", "type manquant");
  if (!(TYPES_EVENEMENT as readonly string[]).includes(type)) {
    return echec("type_inconnu", `Type d'événement inconnu : ${type.slice(0, 64)}`);
  }
  if (typeof at !== "string" || !ISO_DOUALA.test(at) || Number.isNaN(Date.parse(at))) {
    return echec("enveloppe_invalide", "at : heure ISO de Douala (+01:00) attendue");
  }
  if (!estTexte(appareilId, 128)) return echec("enveloppe_invalide", "appareilId manquant");
  if (!estTexte(auteurId, 128)) return echec("enveloppe_invalide", "auteurId manquant");
  if (
    !estObjet(cible) ||
    typeof cible["type"] !== "string" ||
    !(TYPES_CIBLE_SYNC as readonly string[]).includes(cible["type"]) ||
    !estTexte(cible["id"], 128)
  ) {
    return echec("enveloppe_invalide", "cible : { type, id } attendu");
  }
  const numerote = (TYPES_NUMEROTES as readonly string[]).includes(type);
  if (numerote) {
    if (
      typeof numeroPlage !== "number" ||
      !Number.isInteger(numeroPlage) ||
      numeroPlage < 1 ||
      numeroPlage > 9999
    ) {
      return echec("enveloppe_invalide", "numeroPlage : entier de 1 à 9999 attendu");
    }
  } else if (numeroPlage !== null) {
    return echec("enveloppe_invalide", "numeroPlage : null attendu pour ce type");
  }
  if (!estObjet(donnees)) return echec("donnees_invalides", "donnees : objet attendu");
  const probleme = problemeDonnees(type, donnees);
  if (probleme) return echec("donnees_invalides", probleme);
  return {
    ok: true,
    evenement: {
      id,
      type,
      at,
      appareilId,
      auteurId,
      cible: { type: cible["type"], id: cible["id"] as string },
      numeroPlage: numerote ? (numeroPlage as number) : null,
      donnees,
    },
  };
}

/** Les champs que le serveur lit pour rejouer. Le reste du contenu est conservé tel quel. */
function problemeDonnees(type: string, d: Record<string, unknown>): string | null {
  const texte = (cle: string): string | null =>
    estTexte(d[cle]) ? null : `donnees.${cle} : texte attendu`;
  if (TYPES_SIEGE_OCCUPE.includes(type)) {
    const siege = d["siege"];
    const siegeNullable = type === "billet.vendu" && siege === null;
    if (!siegeNullable && (typeof siege !== "number" || !Number.isInteger(siege) || siege < 1)) {
      return "donnees.siege : entier ≥ 1 attendu";
    }
    return texte("billetId") ?? texte("departId");
  }
  if (type === "quai.libere") {
    if (typeof d["siege"] !== "number" || !Number.isInteger(d["siege"]) || d["siege"] < 1) {
      return "donnees.siege : entier ≥ 1 attendu";
    }
    return texte("billetId") ?? texte("departId");
  }
  if (type === "annulation.decidee") {
    if (!["rembourser", "reporter", "avoir", "refuser"].includes(String(d["decision"]))) {
      return "donnees.decision : rembourser, reporter, avoir ou refuser";
    }
    return texte("billetId");
  }
  if (type === "appareil.debloque") {
    if (!["synchroniser", "debloquer_4h", "telephone_secours"].includes(String(d["option"]))) {
      return "donnees.option invalide";
    }
    const valide = d["validePar"];
    if (!estObjet(valide) || !estTexte(valide["superviseurId"], 128)) {
      return "donnees.validePar.superviseurId : texte attendu";
    }
    return texte("appareilId");
  }
  return null;
}
