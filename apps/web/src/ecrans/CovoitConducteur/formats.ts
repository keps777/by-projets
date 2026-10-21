/** 12000 devient « 12 000 ». */
export function formaterMontant(valeur: number): string {
  return String(Math.round(valeur)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 4.9 devient « 4,9 ★ ». */
export function formaterNote(note: number): string {
  return `${note.toFixed(1).replace(".", ",")} ★`;
}

/** `2027-01-09T08:30:00.000+01:00` devient `08:30` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

export type CleJour = "dim" | "lun" | "mar" | "mer" | "jeu" | "ven" | "sam";

const JOURS: readonly CleJour[] = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

/** Jour de la semaine (heure de Douala) d'un instant ISO : `2027-01-09T…` est un samedi. */
export function jourDouala(iso: string): CleJour | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!date) return null;
  const jour = new Date(
    Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3])),
  ).getUTCDay();
  return JOURS[jour] ?? null;
}

/** Ville du segment « En ville » : le contrat de « mes trajets » ne dit pas où se trouve le conducteur. */
export const VILLE_PAR_DEFAUT = "Douala";
