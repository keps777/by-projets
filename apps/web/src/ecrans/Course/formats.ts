import type { voyageur as contrats } from "@afrimove/contrats";

/** 1500 -> « 1 500 » (espaces ordinaires, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 4.8 -> « 4,8 » (virgule décimale). */
export function formaterNote(note: number): string {
  return note.toFixed(1).replace(".", ",");
}

/** « 2027-01-05T07:10:00.000+01:00 » -> « 07:10 » (les heures du contrat sont déjà à l'heure de Douala). */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** « Jean K. » -> « Jean ». */
export function prenom(nom: string): string {
  return nom.trim().split(/\s+/)[0] ?? nom;
}

/** « Chez toi · Bonapriso » -> « chez toi » : le lieu sans son quartier, pour la phrase lue par les lecteurs d'écran. */
export function lieuCourt(lieu: string): string {
  const court = (lieu.split(" · ")[0] ?? lieu).trim();
  return court === "" ? court : court.charAt(0).toLowerCase() + court.slice(1);
}

/** « Gare Akwa · Bêta Express » -> « Bêta Express » (la compagnie dont on rejoint le quai). */
export function compagnieDeLaGare(gare: string): string {
  const morceaux = gare.split(" · ");
  return (morceaux.length > 1 ? morceaux.slice(1).join(" · ") : gare).trim();
}

/** « Gare Akwa · Bêta Express » -> « d'Akwa » ; « Gare Douala · … » -> « de Douala ». */
export function villeDeLaGare(gare: string): string {
  const nom = (gare.split(" · ")[0] ?? gare).replace(/^gare\s+/i, "").trim();
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(nom) ? `d'${nom}` : `de ${nom}`;
}

/* ------------------------------------------------------------------ heure de départ */

const MINUTE_MS = 60_000;
/** Douala est à UTC+1 toute l'année (pas d'heure d'été). */
const DECALAGE_DOUALA_MS = 60 * MINUTE_MS;

/** Instant ISO du contrat (`…+01:00`) pour une date en millisecondes. */
export function versIsoDouala(ms: number): string {
  return new Date(ms + DECALAGE_DOUALA_MS).toISOString().replace(/\.\d{3}Z$/, ".000+01:00");
}

export interface DepartRetenu {
  /** Quand partir (ISO Douala). */
  partirA: string;
  /** Quand on arrive au quai (ISO Douala). */
  arriveeQuai: string;
}

/**
 * Heure de départ à afficher et à réserver. Le serveur propose `partirA` ; l'écran la garde tant qu'elle laisse le
 * temps de faire le trajet et d'être au quai `presenceQuaiMinutes` avant le bus. Si elle est trop tardive (trajet
 * rallongé, bus avancé), on prend le dernier départ possible : départ du bus - présence au quai - trajet.
 */
export function departRetenu(
  p: Pick<
    contrats.PropositionCourse,
    "partirA" | "arriveeQuai" | "busA" | "trajetMinutes" | "presenceQuaiMinutes"
  >,
): DepartRetenu {
  const propose = Date.parse(p.partirA);
  const dernier = Date.parse(p.busA) - (p.presenceQuaiMinutes + p.trajetMinutes) * MINUTE_MS;
  if (Number.isNaN(propose) || Number.isNaN(dernier) || propose <= dernier) {
    return { partirA: p.partirA, arriveeQuai: p.arriveeQuai };
  }
  return {
    partirA: versIsoDouala(dernier),
    arriveeQuai: versIsoDouala(dernier + p.trajetMinutes * MINUTE_MS),
  };
}

/** Mode choisi dans la proposition : celui que le serveur coche, sinon la moto, sinon le premier. */
export function modeInitial(modes: contrats.PropositionCourse["modes"]): contrats.ModeCourse {
  return modes.find((m) => m.choisi)?.mode ?? modes.find((m) => m.mode === "moto")?.mode ?? "moto";
}

/** Prix de la course pour le mode choisi : son prix propre s'il en a un, sinon celui de la proposition. */
export function prixDuMode(p: contrats.PropositionCourse, mode: contrats.ModeCourse): number {
  return p.modes.find((m) => m.mode === mode)?.prix ?? p.prix;
}
