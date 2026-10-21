import { UnprocessableEntityException } from "@nestjs/common";

/**
 * Lecture des événements reçus en HTTP.
 *
 * L'API ne peut pas importer zod ni `@afrimove/contrats` à l'exécution (paquets non compilés, voir le
 * README de l'API) : les schémas du contrat sont relus ici à la main. `parite.test.ts` compare ces
 * lecteurs aux schémas zod du contrat sur des événements valides et sur des événements abîmés
 * champ par champ : un lecteur plus permissif que le contrat fait échouer la CI.
 */

export interface Probleme {
  chemin: string;
  message: string;
}

export const TYPES_CIBLE = [
  "billet",
  "colis",
  "depart",
  "session",
  "appareil",
  "personne",
  "demande",
  "controle",
] as const;
export type TypeCible = (typeof TYPES_CIBLE)[number];

export interface Cible {
  type: TypeCible;
  id: string;
}

/** Comme `z.uuid()` : versions 1 à 8, variante RFC, plus les UUID nul et maximal. */
const UUID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;
const ISO_DOUALA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/;
const SIGNATURE_HEX = /^[0-9a-f]{16,}$/;

const estObjet = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Accumule les problèmes d'un document au lieu de s'arrêter au premier. */
export class Lecteur {
  readonly problemes: Probleme[] = [];

  echec(chemin: string, message: string): undefined {
    this.problemes.push({ chemin, message });
    return undefined;
  }

  objet(v: unknown, chemin: string): Record<string, unknown> | undefined {
    return estObjet(v) ? v : this.echec(chemin, "objet attendu");
  }

  texte(v: unknown, chemin: string, max = 500): string | undefined {
    if (typeof v !== "string" || v.length === 0)
      return this.echec(chemin, "texte non vide attendu");
    if (v.length > max) return this.echec(chemin, `texte de ${max} caractères au plus`);
    return v;
  }

  /** Texte libre : peut être vide (`z.string()` sans minimum). */
  texteLibre(v: unknown, chemin: string, max = 1000): string | undefined {
    if (typeof v !== "string") return this.echec(chemin, "texte attendu");
    if (v.length > max) return this.echec(chemin, `texte de ${max} caractères au plus`);
    return v;
  }

  entier(v: unknown, chemin: string, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
    if (typeof v !== "number" || !Number.isSafeInteger(v)) {
      return this.echec(chemin, "entier attendu");
    }
    if (v < min) return this.echec(chemin, `entier d'au moins ${min} attendu`);
    if (v > max) return this.echec(chemin, `entier d'au plus ${max} attendu`);
    return v;
  }

  /** Montant en FCFA : entier, négatif permis (écart). */
  fcfa(v: unknown, chemin: string): number | undefined {
    return this.entier(v, chemin);
  }

  /** Montant en FCFA qui ne peut pas être négatif. */
  fcfaPositif(v: unknown, chemin: string): number | undefined {
    return this.entier(v, chemin, 0);
  }

  booleen(v: unknown, chemin: string): boolean | undefined {
    return typeof v === "boolean" ? v : this.echec(chemin, "booléen attendu");
  }

  iso(v: unknown, chemin: string): string | undefined {
    if (typeof v !== "string" || !ISO_DOUALA.test(v) || Number.isNaN(Date.parse(v))) {
      return this.echec(chemin, "heure ISO de Douala (+01:00) attendue");
    }
    return v;
  }

  uuid(v: unknown, chemin: string): string | undefined {
    return typeof v === "string" && UUID.test(v) ? v : this.echec(chemin, "UUID attendu");
  }

  choix<T extends string>(v: unknown, chemin: string, valeurs: readonly T[]): T | undefined {
    if (typeof v === "string" && (valeurs as readonly string[]).includes(v)) return v as T;
    return this.echec(chemin, `une valeur parmi : ${valeurs.join(", ")}`);
  }

  nullable<T>(v: unknown, lire: (x: unknown) => T | undefined): T | null | undefined {
    return v === null ? null : lire(v);
  }

  liste<T>(
    v: unknown,
    chemin: string,
    lire: (x: unknown, chemin: string) => T | undefined,
    max = 500,
  ): T[] | undefined {
    if (!Array.isArray(v)) return this.echec(chemin, "liste attendue");
    if (v.length > max) return this.echec(chemin, `${max} éléments au plus`);
    const sortie: T[] = [];
    let complet = true;
    v.forEach((x, i) => {
      const lu = lire(x, `${chemin}[${i}]`);
      if (lu === undefined) complet = false;
      else sortie.push(lu);
    });
    return complet ? sortie : undefined;
  }

  /** `{ superviseurId, methode, signature }` : la preuve de validation par un superviseur. */
  validationSuperviseur(v: unknown, chemin: string): ValidationSuperviseurLue | undefined {
    const o = this.objet(v, chemin);
    if (!o) return undefined;
    const superviseurId = this.texte(o["superviseurId"], `${chemin}.superviseurId`, 128);
    const methode = this.choix(o["methode"], `${chemin}.methode`, ["pin", "empreinte"] as const);
    const signature =
      typeof o["signature"] === "string" && SIGNATURE_HEX.test(o["signature"])
        ? o["signature"]
        : this.echec(`${chemin}.signature`, "signature hexadécimale (16 caractères au moins)");
    if (superviseurId === undefined || methode === undefined || signature === undefined) {
      return undefined;
    }
    return { superviseurId, methode, signature };
  }
}

export interface ValidationSuperviseurLue {
  superviseurId: string;
  methode: "pin" | "empreinte";
  signature: string;
}

/** Un événement après lecture : l'enveloppe commune et des données typées. */
export interface EvenementLu<D> {
  id: string;
  type: string;
  at: string;
  appareilId: string;
  auteurId: string;
  /** Déduite des données (le contrat ne demande que sa forme). */
  cible: Cible;
  numeroPlage: null;
  donnees: D;
}

export interface DefinitionLecture<D> {
  type: string;
  donnees: (l: Lecteur, d: Record<string, unknown>) => D | undefined;
  cible: (d: D) => Cible;
}

export class EvenementInvalide extends UnprocessableEntityException {
  constructor(type: string, details: Probleme[]) {
    super({
      code: "EVENEMENT_INVALIDE",
      message: `Événement ${type} invalide`,
      details,
    });
  }
}

/**
 * Lit un événement non numéroté : l'enveloppe commune (`id` UUID, `type`, `at` ISO Douala,
 * `appareilId`, `auteurId`, `cible`, `numeroPlage: null`) puis les données propres au type.
 * Lève 422 `EVENEMENT_INVALIDE` avec la liste des problèmes.
 */
export function lireEvenement<D>(brut: unknown, def: DefinitionLecture<D>): EvenementLu<D> {
  const l = new Lecteur();
  const o = l.objet(brut, "");
  if (!o) throw new EvenementInvalide(def.type, l.problemes);

  const id = l.uuid(o["id"], "id");
  if (o["type"] !== def.type) l.echec("type", `« ${def.type} » attendu`);
  const at = l.iso(o["at"], "at");
  const appareilId = l.texte(o["appareilId"], "appareilId", 128);
  const auteurId = l.texte(o["auteurId"], "auteurId", 128);
  const cible = l.objet(o["cible"], "cible");
  if (cible) {
    l.choix(cible["type"], "cible.type", TYPES_CIBLE);
    l.texte(cible["id"], "cible.id", 128);
  }
  if (o["numeroPlage"] !== null) l.echec("numeroPlage", "null attendu pour ce type");
  const donneesBrutes = l.objet(o["donnees"], "donnees");
  const donnees = donneesBrutes ? def.donnees(l, donneesBrutes) : undefined;

  if (
    l.problemes.length > 0 ||
    id === undefined ||
    at === undefined ||
    appareilId === undefined ||
    auteurId === undefined ||
    donnees === undefined
  ) {
    throw new EvenementInvalide(def.type, l.problemes);
  }
  return {
    id,
    type: def.type,
    at,
    appareilId,
    auteurId,
    cible: def.cible(donnees),
    numeroPlage: null,
    donnees,
  };
}
