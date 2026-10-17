import type { colis as contrats } from "@afrimove/contrats";

/** 4000 -> « 4 000 » (espaces ordinaires, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** « 2027-01-06T08:30:00.000+01:00 » -> « 08:30 » (les heures du contrat sont déjà à l'heure de Douala). */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

const MOIS_COURTS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

/** « 2026-12-28T00:00:00.000+01:00 » -> « 28 déc. » ; « 2027-01-01 » -> « 1 janv. » ; illisible -> « ». */
export function dateCourte(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const mois = MOIS_COURTS[Number(m[2]) - 1];
  return mois === undefined ? "" : `${Number(m[3])} ${mois}`;
}

/** Jour du calendrier de Douala (UTC+1, sans heure d'été) de l'instant donné, « AAAA-MM-JJ ». */
export function jourDeDouala(instant: Date): string {
  return new Date(instant.getTime() + 3_600_000).toISOString().slice(0, 10);
}

/** Jours entre deux « AAAA-MM-JJ » (positif quand `jour` est après `depuis`). */
function ecartEnJours(jour: string, depuis: string): number {
  const ms = Date.parse(`${jour}T00:00:00Z`) - Date.parse(`${depuis}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export type JourRelatif =
  | { type: "aujourdhui" }
  | { type: "demain" }
  | { type: "date"; date: string };

/** Le jour des départs proposés, dit par rapport à aujourd'hui : « demain » dans la planche. */
export function jourRelatif(jour: string, maintenant: Date): JourRelatif {
  const ecart = ecartEnJours(jour, jourDeDouala(maintenant));
  if (ecart === 0) return { type: "aujourdhui" };
  if (ecart === 1) return { type: "demain" };
  return { type: "date", date: dateCourte(jour) };
}

/** [« Alpha », « Bêta »] -> « Alpha et Bêta » ; trois noms -> « A, B et C ». */
export function listeFrancaise(noms: readonly string[]): string {
  if (noms.length <= 1) return noms[0] ?? "";
  return `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
}

/** « Douala → Yaoundé » -> origine et destination ; sans flèche, tout le texte est l'origine. */
export function separerTrajet(trajet: string): { origine: string; destination: string | null } {
  const [origine = "", ...reste] = trajet.split("→").map((s) => s.trim());
  return { origine, destination: reste.length > 0 ? reste.join(" → ") : null };
}

/** « Bêta Express » (classe VIP) -> « Bêta Express VIP » ; le nom qui dit déjà « VIP » reste tel quel. */
export function nomCompagnie(depart: Pick<contrats.DepartVendeur, "compagnie" | "classe">): string {
  if (depart.classe !== "vip" || /\bVIP$/i.test(depart.compagnie.trim())) return depart.compagnie;
  return `${depart.compagnie} VIP`;
}

export type DetailDepart = { type: "paiement" } | { type: "commission"; montant: number };

/**
 * Détail sous le nom de la compagnie : la phrase du paiement sur le premier départ quand sa commission est celle par
 * défaut, sinon la commission du départ (« commission 150 F »).
 */
export function detailDepart(
  depart: Pick<contrats.DepartVendeur, "commission">,
  rang: number,
  commissionParDefaut: number,
): DetailDepart {
  if (rang === 0 && depart.commission === commissionParDefaut) return { type: "paiement" };
  return { type: "commission", montant: depart.commission };
}

/**
 * Départ proposé à la revente d'un client : celui dont l'heure est dans la proposition (« vendredi 08:30 » ->
 * 08:30), sinon le premier de la liste. `undefined` quand il n'y a aucun départ.
 */
export function departPourClient(
  departs: readonly contrats.DepartVendeur[],
  proposition: string | null,
): contrats.DepartVendeur | undefined {
  const heure = proposition === null ? null : /\b(\d{1,2}):(\d{2})\b/.exec(proposition);
  if (heure) {
    const voulue = `${(heure[1] ?? "").padStart(2, "0")}:${heure[2]}`;
    const trouve = departs.find((d) => heureDouala(d.heureDepart) === voulue);
    if (trouve) return trouve;
  }
  return departs[0];
}
