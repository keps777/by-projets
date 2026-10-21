/** Formats de l'écran « Deviens livreur » : montants (« 700 », « 31 k »), moyen de déplacement, numéro MoMo. */

/** « 700 » ; « 86 » ; « 12500 » -> « 12 500 » (espace ordinaire, comme la maquette). */
export function formaterNombre(valeur: number): string {
  return String(Math.trunc(valeur)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Gain abrégé de la maquette : 31000 -> « 31 k », 31500 -> « 31,5 k », 800 -> « 800 ». */
export function abreger(montant: number): string {
  if (montant < 1000) return String(Math.trunc(montant));
  const milliers = Math.round(montant / 100) / 10;
  return `${String(milliers).replace(".", ",")} k`;
}

export type Deplacement = "moto" | "velo" | "pied" | "tricycle";

function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** « Moto » -> moto, « Vélo » -> velo, « À pied » -> pied, « Tricycle · gros colis » -> tricycle. */
export function deplacementDe(libelle: string): Deplacement | null {
  const l = sansAccents(libelle).trim();
  if (l.startsWith("moto")) return "moto";
  if (l.startsWith("velo")) return "velo";
  if (l.startsWith("a pied") || l.startsWith("pied")) return "pied";
  if (l.startsWith("tricycle")) return "tricycle";
  return null;
}

/** Les pièces qui ne se demandent qu'à moto : le permis et l'assurance (la CNI est déjà vérifiée). */
export type PieceMoto = "permis" | "assurance";

export function pieceMotoDe(titre: string): PieceMoto | null {
  const l = sansAccents(titre).trim();
  if (l.startsWith("permis")) return "permis";
  if (l.startsWith("assurance")) return "assurance";
  return null;
}

export type Operateur = "mtn" | "orange";

/** Les neuf chiffres d'un numéro camerounais saisi (« 6 75 12 34 09 », « +237 675123409 »), `null` s'il est incomplet. */
export function neufChiffres(saisie: string): string | null {
  const nombre = (saisie.split("·")[0] ?? "").replace(/\D/g, "");
  const national = nombre.startsWith("237") && nombre.length === 12 ? nombre.slice(3) : nombre;
  return /^6\d{8}$/.test(national) ? national : null;
}

/** Opérateur lu après la puce (« … · Orange »), sinon deviné sur le début du numéro. */
export function operateurDe(saisie: string, neuf: string | null): Operateur {
  const suffixe = sansAccents(saisie.split("·")[1] ?? "");
  if (suffixe.includes("orange")) return "orange";
  if (suffixe.includes("mtn")) return "mtn";
  return neuf !== null && /^(69|65[5-9])/.test(neuf) ? "orange" : "mtn";
}

/** Découpe un texte de règles « 1. … 2. … 3. … » pour mettre les numéros en gras, comme la maquette. */
export function decouperRegles(texte: string): { texte: string; gras: boolean }[] {
  return texte
    .split(/(?:^|(?<=\s))(\d\.)(?=\s)/)
    .filter((morceau) => morceau !== "")
    .map((morceau) => ({ texte: morceau, gras: /^\d\.$/.test(morceau) }));
}
