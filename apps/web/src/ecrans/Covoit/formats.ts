import type { voyageur as c } from "@afrimove/contrats";

/** Trajet de la planche : Douala → Kribi. */
export const TRAJET_PAR_DEFAUT = { depart: "Douala", arrivee: "Kribi" } as const;

/** Ville du voyageur tant que la recherche n'a pas dit où il se trouve (pastille et segment « En ville »). */
export const VILLE_PAR_DEFAUT = "Douala";

/** Plafond du filtre « ≤ 4 000 » (F la place). */
export const PRIX_MAX_FILTRE = 4000;

export type FiltreChoisi = c.FiltreCovoit;

/** Les filtres proposés après « Tous », dans l'ordre de la planche. */
export const FILTRES_PROPOSES: readonly FiltreChoisi[] = [
  "clim",
  "femmes",
  "grand_bagage",
  "prix_max",
];

/** Paramètres de recherche pour un trajet et les filtres choisis. */
export function rechercheDe(
  trajet: { depart: string; arrivee: string },
  filtres: readonly FiltreChoisi[],
): c.RechercheCovoit {
  return {
    depart: trajet.depart,
    arrivee: trajet.arrivee,
    ...(filtres.length > 0 ? { filtres: [...filtres] } : {}),
    ...(filtres.includes("prix_max") ? { prixMax: PRIX_MAX_FILTRE } : {}),
  };
}

/** `2027-01-05T08:30:00.000+01:00` devient `08:30` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** Heure de Douala (UTC+1) d'un instant donné par l'horloge, au format `HH:MM`. */
export function heureDoualaDe(instant: Date): string {
  return new Date(instant.getTime() + 3_600_000).toISOString().slice(11, 16);
}

/** 4000 devient « 4 000 ». */
export function formaterMontant(valeur: number): string {
  return String(Math.round(valeur)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 150 minutes deviennent « 2 h 30 », 120 « 2 h », 45 « 45 min ». */
export function formaterDuree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** 4.9 devient « 4,9 ★ ». */
export function formaterNote(note: number): string {
  return `${note.toFixed(1).replace(".", ",")} ★`;
}

export type MomentJournee = "matin" | "apresMidi" | "soir";

/** Moment de la journée d'une heure de Douala : « 07:38 » est le matin. */
export function momentDe(heure: string): MomentJournee {
  const h = Number(heure.slice(0, 2));
  if (h < 12) return "matin";
  if (h < 18) return "apresMidi";
  return "soir";
}

export type TonConducteur = "vert" | "bleu" | "ambre";

const TONS: readonly TonConducteur[] = ["vert", "bleu", "ambre"];

/** Couleur de l'avatar selon le rang dans la liste : vert, bleu, ambre, puis on recommence. */
export function tonDuRang(rang: number): TonConducteur {
  return TONS[rang % TONS.length] ?? "vert";
}

/**
 * Le lieu de départ coupé à la première virgule : « Bonapriso, pharmacie du Rond-point » donne le quartier
 * (en gras sur la planche) et le repère (", pharmacie du Rond-point").
 */
export function separerLieu(lieu: string): { quartier: string; repere: string } {
  const i = lieu.indexOf(",");
  if (i === -1) return { quartier: lieu, repere: "" };
  return { quartier: lieu.slice(0, i), repere: lieu.slice(i) };
}
