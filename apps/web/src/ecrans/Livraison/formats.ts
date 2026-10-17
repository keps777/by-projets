import type { colis as contrats } from "@afrimove/contrats";

/** 1000 -> « 1 000 » (espaces ordinaires, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 4.9 -> « 4,9 » (virgule décimale). */
export function formaterNote(note: number): string {
  return note.toFixed(1).replace(".", ",");
}

/** 2 -> « 2 », 2.5 -> « 2,5 ». */
export function formaterPoids(kg: number): string {
  return String(kg).replace(".", ",");
}

/** « 2027-01-05T13:24:00.000+01:00 » -> « 13:24 » (les heures du contrat sont déjà à l'heure de Douala). */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** « 482913 » -> « 482 913 » (deux groupes de trois chiffres). */
export function grouperCode(code: string): string {
  return /^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** « Éric T. » -> « Éric ». */
export function prenom(nom: string): string {
  return nom.trim().split(/\s+/)[0] ?? nom;
}

/** « C-DLA-270105-0017 » -> « C-…-0017 » : la planche n'écrit que le début et la fin du numéro. */
export function referenceCourte(numero: string): string {
  const morceaux = numero.split("-");
  if (morceaux.length < 3) return numero;
  return `${morceaux[0]}-…-${morceaux[morceaux.length - 1]}`;
}

/**
 * Nom sous lequel le client appelle le destinataire (« Maman »). Le colis le donne quand on peut le lire ; sinon on le
 * retrouve dans « Arrive chez Maman » ou « Chez Maman · Tamdja » ; sinon `null`.
 */
export function nomDestinataire(
  livraison: Pick<contrats.LivraisonColis, "arrivee" | "carte">,
  surnomColis?: string | null,
): string | null {
  if (surnomColis !== undefined && surnomColis !== null && surnomColis.trim() !== "") {
    return surnomColis.trim();
  }
  const libelle = /\bchez\s+(.+)$/i.exec(livraison.arrivee.libelle)?.[1];
  const adresse = /^chez\s+([^·]+)/i.exec(livraison.carte.arrivee)?.[1];
  const nom = (libelle ?? adresse)?.trim();
  return nom === undefined || nom === "" ? null : nom;
}

/** Ce que l'écran affiche de la position du livreur : la lecture, remplacée par le dernier message du direct. */
export interface PositionAffichee {
  minutes: number;
  arriveeEstimee: string;
}

export function appliquerPosition(
  livraison: contrats.LivraisonColis,
  message: contrats.PositionLivreur | undefined,
): PositionAffichee {
  if (message !== undefined && message.colisId === livraison.colisId) {
    return { minutes: message.minutesRestantes, arriveeEstimee: message.arriveeEstimee };
  }
  return { minutes: livraison.carte.livreurMinutes, arriveeEstimee: livraison.arrivee.estimee };
}

/* ------------------------------------------------------------------ tracé de la carte */

export interface Point {
  x: number;
  y: number;
}

/** Itinéraire de la maquette : du retrait (Gare Alpha) à la maison de Maman. */
export const ITINERAIRE: readonly Point[] = [
  { x: 330, y: 60 },
  { x: 330, y: 150 },
  { x: 220, y: 160 },
  { x: 140, y: 170 },
  { x: 140, y: 245 },
  { x: 90, y: 250 },
];

/** Place du livreur sur la maquette : le troisième sommet de l'itinéraire. */
const SOMMET_LIVREUR = 2;

const LONGUEURS = ITINERAIRE.slice(1).map((p, i) =>
  Math.hypot(p.x - ITINERAIRE[i]!.x, p.y - ITINERAIRE[i]!.y),
);
const TOTAL = LONGUEURS.reduce((a, b) => a + b, 0);
/** Avancée du livreur sur la planche. */
const AVANCEE_PLANCHE = LONGUEURS.slice(0, SOMMET_LIVREUR).reduce((a, b) => a + b, 0) / TOTAL;

function arrondir(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

/**
 * Avancée du livreur sur l'itinéraire (0 = retrait, 1 = chez le destinataire). Elle vaut celle de la planche quand il
 * reste autant de minutes qu'à l'ouverture de l'écran, puis augmente jusqu'à 1 quand il n'en reste plus.
 */
export function avancee(minutes: number, minutesDepart: number): number {
  const depart = Math.max(1, minutesDepart);
  const restant = Math.min(Math.max(0, minutes), depart);
  return 1 - (1 - AVANCEE_PLANCHE) * (restant / depart);
}

/** Itinéraire parcouru jusqu'à `fraction` : les sommets passés, puis le point où se trouve le livreur. */
export function parcouru(fraction: number): Point[] {
  const cible = Math.min(1, Math.max(0, fraction)) * TOTAL;
  const points: Point[] = [ITINERAIRE[0]!];
  let fait = 0;
  for (let i = 0; i < LONGUEURS.length; i += 1) {
    const segment = LONGUEURS[i]!;
    const debut = ITINERAIRE[i]!;
    const fin = ITINERAIRE[i + 1]!;
    if (fait + segment >= cible - 1e-9) {
      const t = segment === 0 ? 0 : (cible - fait) / segment;
      points.push({
        x: arrondir(debut.x + (fin.x - debut.x) * t),
        y: arrondir(debut.y + (fin.y - debut.y) * t),
      });
      return points;
    }
    points.push(fin);
    fait += segment;
  }
  return points;
}

/** Position du livreur sur la carte. */
export function pointLivreur(fraction: number): Point {
  const points = parcouru(fraction);
  return points[points.length - 1]!;
}

/** Attribut `d` d'une ligne brisée. */
export function tracer(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}
