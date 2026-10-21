import { telephoneDeSaisie } from "../Cadence/format";

/** Ce que tape le convoyeur, tel quel dans les trois champs. */
export interface Saisie {
  nom: string;
  piece: string;
  telephone: string;
}

export type ChampSaisie = keyof Saisie;

export type Validation =
  | {
      ok: true;
      /** Les données de l'événement `billet.complete` (sans l'identifiant du billet ni du départ). */
      donnees: { nom: string; pieceQuatreDerniers: string; telephone: string | null };
    }
  | { ok: false; champ: ChampSaisie };

/**
 * Sans nom, pas d'embarquement : le nom (non vide) et les 4 chiffres de la pièce sont obligatoires. Le téléphone est
 * facultatif, mais s'il est tapé il doit être complet (9 chiffres) : un numéro coupé n'enverrait jamais le SMS.
 * Renvoie le premier champ à corriger, dans l'ordre de l'écran.
 */
export function validerSaisie(saisie: Saisie): Validation {
  const nom = saisie.nom.trim().replace(/\s+/g, " ");
  if (nom === "") return { ok: false, champ: "nom" };
  const piece = saisie.piece.trim();
  if (!/^\d{4}$/.test(piece)) return { ok: false, champ: "piece" };
  if (saisie.telephone.trim() === "") {
    return { ok: true, donnees: { nom, pieceQuatreDerniers: piece, telephone: null } };
  }
  const telephone = telephoneDeSaisie(saisie.telephone);
  if (telephone === null) return { ok: false, champ: "telephone" };
  return { ok: true, donnees: { nom, pieceQuatreDerniers: piece, telephone } };
}

/** « 2027-01-05T05:22:10.000+01:00 » -> « 05:22:10 » (les heures du contrat sont déjà à l'heure de Douala). */
export function heureSecondes(iso: string): string {
  return iso.slice(11, 19);
}

/** Part de la jauge d'embarquement, entière et bornée : 15 nominatifs sur 40 -> 38. */
export function partDe(nombre: number, capacite: number): number {
  if (capacite <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((nombre / capacite) * 100)));
}
