import type { colis as contrats } from "@afrimove/contrats";
import type { DetailEtapeColis } from "@afrimove/ui";

/** Jalons du suivi, dans l'ordre de la frise : déposé, chargé, en route, disponible, remis. */
export const JALONS: readonly contrats.JalonSuivi[] = [
  "depose",
  "charge",
  "en_route",
  "disponible",
  "remis",
];

/** 25000 -> « 25 000 » (espaces ordinaires, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 2 -> « 2 », 2.5 -> « 2,5 » (virgule décimale ; l'unité « kg » est dans le texte). */
export function formaterPoids(kg: number): string {
  return String(kg).replace(".", ",");
}

/** « 2027-01-05T07:52:00.000+01:00 » -> « 07:52 » (les heures du contrat sont déjà à l'heure de Douala). */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** Jour d'une promesse de réponse : « jeudi 7 janvier », à l'heure de Douala. */
export function jourDouala(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Douala",
  }).format(date);
}

/** Heure d'une étape : « 07:52 », « ~13:00 » pour une prévision, « — » tant qu'elle n'est pas connue. */
export function heureEtape(etape: contrats.EtapeSuivi): string {
  if (etape.a === null) return "—";
  return `${etape.estimee ? "~" : ""}${heureDouala(etape.a)}`;
}

function rangDe(jalon: contrats.JalonSuivi): number {
  return JALONS.indexOf(jalon);
}

/** Rang de la dernière étape franchie, -1 si le colis n'a encore été déposé nulle part. */
function derniereFaite(suivi: readonly contrats.EtapeSuivi[]): number {
  let dernier = -1;
  for (const etape of suivi) {
    if (etape.fait) dernier = Math.max(dernier, rangDe(etape.jalon));
  }
  return dernier;
}

/**
 * Étape en cours de la frise : la dernière franchie (« En route » pulse tant que le colis n'est pas arrivé), la
 * première si rien n'est encore fait, et au-delà de la dernière quand le colis est remis (tout est vert).
 */
export function etapeCourante(suivi: readonly contrats.EtapeSuivi[]): number {
  const derniere = derniereFaite(suivi);
  if (derniere < 0) return 0;
  return derniere >= JALONS.length - 1 ? JALONS.length : derniere;
}

/** Le colis est remis : plus rien à choisir, plus rien à attendre. */
export function estRemis(suivi: readonly contrats.EtapeSuivi[]): boolean {
  return derniereFaite(suivi) >= JALONS.length - 1;
}

/**
 * Applique un message du suivi en direct (scan au guichet, chez le convoyeur, au relais, chez le livreur) : les étapes
 * jusqu'au jalon annoncé sont franchies et celle-ci prend l'heure du scan. Un message qui n'avance pas (déjà connu, ou
 * en retard sur la lecture) ne change rien : la lecture du colis reste la référence.
 */
export function appliquerMessage(
  suivi: readonly contrats.EtapeSuivi[],
  message: contrats.MessageSuiviColis | undefined,
): readonly contrats.EtapeSuivi[] {
  if (message === undefined) return suivi;
  const rang = rangDe(message.jalon);
  if (rang <= derniereFaite(suivi)) return suivi;
  return suivi.map((etape) => {
    const rangEtape = rangDe(etape.jalon);
    if (rangEtape > rang || etape.fait) return etape;
    return rangEtape === rang
      ? { ...etape, fait: true, estimee: false, a: message.a }
      : { ...etape, fait: true };
  });
}

/**
 * Texte d'une étape pour la frise : le nom de l'étape, puis son détail après « · ». Un détail qui commence par un lieu
 * (« à Bafoussam · SMS à Maman avec le lieu ») se lit à la suite du nom : « Disponible à Bafoussam · SMS à… ».
 */
export function detailEtape(etape: contrats.EtapeSuivi | undefined): DetailEtapeColis {
  if (etape === undefined) return {};
  const detail: DetailEtapeColis = { heure: heureEtape(etape) };
  const morceaux = (etape.detail ?? "").split(" · ").filter((m) => m !== "");
  if (morceaux[0]?.startsWith("à ")) {
    detail.libelle = `${etape.libelle} ${morceaux[0]}`;
    morceaux.shift();
  } else {
    detail.libelle = etape.libelle;
  }
  if (morceaux.length > 0) detail.detail = morceaux.join(" · ");
  return detail;
}

/** Une étape par jalon, dans l'ordre de la frise (le contrat ne garantit pas l'ordre du tableau). */
export function detailsFrise(suivi: readonly contrats.EtapeSuivi[]): DetailEtapeColis[] {
  return JALONS.map((jalon) => detailEtape(suivi.find((e) => e.jalon === jalon)));
}
