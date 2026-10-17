/** Formats et petits calculs de la planche « Covoiturage en ville » (valeurs de la maquette : « dans 3 min », « 700 »). */
import type { voyageur as c } from "@afrimove/contrats";

/** Types d'offre de cette planche : des voitures et des motos-taxis, pas les bus de ville. */
export const TYPES_PROPOSES: readonly c.TypeOffreVille[] = ["covoiturage", "moto_taxi"];

/** Au-delà de ce délai, la ligne d'un covoiturage affiche l'heure de départ (« 08:00 ») plutôt que « dans 3 min ». */
export const SEUIL_DELAI_MINUTES = 10;

/** `2027-01-05T08:00:00.000+01:00` devient `08:00` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** 1000 devient « 1 000 », 700 reste « 700 ». */
export function formaterMontant(valeur: number): string {
  return String(Math.round(valeur)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 4.9 devient « 4,9 ★ ». */
export function formaterNote(note: number): string {
  return `${note.toFixed(1).replace(".", ",")} ★`;
}

/**
 * Les deux lettres de la pastille : « Clarisse » donne « CL », « Jean-Marc » « JM », « Samuel E. » « SE ».
 * Un nom en plusieurs parties (espace ou trait d'union) prend l'initiale des deux premières.
 */
export function initiales(nom: string): string {
  const parties = nom.split(/[\s-]+/).filter((p) => /\p{L}/u.test(p));
  const [premiere = "", deuxieme] = parties;
  const lettres = deuxieme ? premiere.charAt(0) + deuxieme.charAt(0) : premiere.slice(0, 2);
  return lettres.toLocaleUpperCase("fr");
}

export type TonConducteur = "vert" | "bleu" | "ambre";

const TONS: readonly TonConducteur[] = ["vert", "bleu", "ambre"];

/** Couleur de la pastille selon le rang dans la liste : vert, bleu, ambre, puis on recommence. */
export function tonDuRang(rang: number): TonConducteur {
  return TONS[rang % TONS.length] ?? "vert";
}

/** Vrai quand la ligne annonce un délai (« dans 3 min ») plutôt qu'une heure. */
export function departImminent(offre: Pick<c.OffreVille, "departDansMinutes">): boolean {
  return offre.departDansMinutes <= SEUIL_DELAI_MINUTES;
}

/**
 * Offre d'un trajet régulier : le détail commence par « chaque matin ». Le contrat n'a pas de champ « régulier »,
 * le détail est le seul endroit où l'API le dit.
 */
export function estRegulier(offre: Pick<c.OffreVille, "detail">): boolean {
  return /^chaque matin\b/i.test(offre.detail.trim());
}

/** Textes dont les formats ont besoin (libellés traduits). */
export interface TextesOffre {
  verifie: string;
  regulier: string;
  dans: (minutes: number) => string;
  minutes: (minutes: number) => string;
  motoTaxi: string;
}

/**
 * Première ligne d'une offre, sans la mention : « Clarisse · dans 3 min », « Jean-Marc · 08:00 »,
 * « Paul · moto-taxi · 5 min ». Une moto-taxi vient te chercher : on annonce sa durée d'attente, jamais une heure.
 */
export function titreOffre(offre: c.OffreVille, textes: TextesOffre): string {
  if (offre.type === "moto_taxi") {
    return `${offre.qui} · ${textes.motoTaxi} · ${textes.minutes(offre.departDansMinutes)}`;
  }
  const quand = departImminent(offre)
    ? textes.dans(offre.departDansMinutes)
    : heureDouala(offre.departA);
  return `${offre.qui} · ${quand}`;
}

/** « · vérifiée · 4,9 ★ », « · régulier · 4,8 ★ » : ce que le conducteur a déjà prouvé (vide s'il n'a rien). */
export function mentionOffre(offre: c.OffreVille, textes: TextesOffre): string {
  const parties = [
    ...(offre.verifie ? [textes.verifie] : []),
    ...(estRegulier(offre) ? [textes.regulier] : []),
    ...(offre.note !== undefined ? [formaterNote(offre.note)] : []),
  ];
  return parties.length > 0 ? `· ${parties.join(" · ")}` : "";
}
