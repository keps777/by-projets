/**
 * Les villes que l'on sait reconnaître dans un message. Les codes sont ceux des gares de la
 * billetterie (`Catalogue.ville(code)`), repris des villes des maquettes (`CODES_VILLES` du client
 * d'API, gares du monde commun) : Douala `DLA`, Yaoundé `YDE`, Bafoussam `BAF`, Bamenda `BAM`,
 * Kribi `KRI`, Ngaoundéré `NGA`. Une ville qui n'a pas de gare dans le catalogue donne simplement
 * « aucun départ » ; une ville absente de cette liste se règle par `WHATSAPP_ACHAT_VILLES`.
 */

export interface Ville {
  /** Code de ville de la billetterie. */
  code: string;
  /** Nom affiché dans les réponses. */
  nom: string;
  /** Façons d'écrire la ville, sans accent ni majuscule (un ou deux mots). */
  alias: readonly string[];
}

export const VILLES_PAR_DEFAUT: readonly Ville[] = [
  { code: "DLA", nom: "Douala", alias: ["douala", "dwala", "duala", "dla"] },
  { code: "YDE", nom: "Yaoundé", alias: ["yaounde", "yaunde", "yde", "yao"] },
  { code: "BAF", nom: "Bafoussam", alias: ["bafoussam", "bafusam", "baf"] },
  { code: "BAM", nom: "Bamenda", alias: ["bamenda", "bam"] },
  { code: "KRI", nom: "Kribi", alias: ["kribi"] },
  { code: "NGA", nom: "Ngaoundéré", alias: ["ngaoundere", "ngaounde"] },
];

/** Passe un texte à la forme des alias : minuscules, sans accent, mots séparés par un espace. */
export function formeAlias(texte: string): string {
  return texte
    .toLowerCase()
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export class VillesInvalides extends Error {
  constructor(readonly erreur: string) {
    super(erreur);
    this.name = "VillesInvalides";
  }
}

/**
 * Lit `WHATSAPP_ACHAT_VILLES` : des villes en plus, `Garoua=GAR,Maroua=MAR`. Un code déjà connu
 * reçoit seulement un alias de plus ; un code doit avoir trois lettres majuscules.
 */
export function villesAvecSupplement(supplement: string | undefined): readonly Ville[] {
  const villes: Ville[] = VILLES_PAR_DEFAUT.map((v) => ({ ...v, alias: [...v.alias] }));
  if (supplement === undefined || supplement.trim() === "") return villes;
  for (const element of supplement.split(",")) {
    const m = /^\s*([^=]{2,40}?)\s*=\s*([A-Z]{3})\s*$/.exec(element);
    if (!m) throw new VillesInvalides(`« ${element.trim()} » : écrire Nom=ABC (trois lettres)`);
    const nom = m[1]!;
    const code = m[2]!;
    const alias = formeAlias(nom);
    if (alias === "" || alias.split(" ").length > 2) {
      throw new VillesInvalides(`« ${nom} » : un ou deux mots`);
    }
    const existante = villes.find((v) => v.code === code);
    if (existante) {
      (existante.alias as string[]).push(alias);
    } else {
      villes.push({ code, nom, alias: [alias] });
    }
  }
  return villes;
}
