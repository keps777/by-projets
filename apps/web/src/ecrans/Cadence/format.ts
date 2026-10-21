/** « 4000 » -> « 4 000 » (espace simple, comme dans les planches). */
export function formaterMontant(montant: number): string {
  return String(Math.trunc(montant)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Numéro de séquence d'un billet sur 4 chiffres : 232 -> « 0232 ». */
export function sequenceSur4(sequence: number): string {
  return String(sequence).padStart(4, "0");
}

const UNE_HEURE_MS = 60 * 60 * 1000;

/**
 * Heure de Douala (UTC+1 toute l'année) d'un instant : « 05:14 », ou « 05:14:52 » avec les secondes. Les heures
 * du contrat sont déjà à l'heure de Douala ; cette fonction sert pour l'horloge de l'application.
 */
export function heureDoualaDe(instant: Date, avecSecondes = false): string {
  const iso = new Date(instant.getTime() + UNE_HEURE_MS).toISOString();
  return avecSecondes ? iso.slice(11, 19) : iso.slice(11, 16);
}

/** « 2027-01-05T05:30:00.000+01:00 » -> « 05:30 » (déjà à l'heure de Douala). */
export function heureDeIso(iso: string): string {
  return iso.slice(11, 16);
}

/** « 2027-01-05T05:30:00.000+01:00 » -> « 05.01.27 ». */
export function dateCourteDeIso(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`;
}

export type Ecoule =
  | { unite: "secondes"; n: number }
  | { unite: "minutes"; n: number }
  | { unite: "heures"; h: number; m: string };

/** Temps écoulé entre un instant du contrat et maintenant, en secondes, minutes ou heures (jamais négatif). */
export function ecoule(depuis: string, maintenant: Date): Ecoule {
  const secondes = Math.max(0, Math.floor((maintenant.getTime() - Date.parse(depuis)) / 1000));
  if (secondes < 60) return { unite: "secondes", n: secondes };
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return { unite: "minutes", n: minutes };
  return { unite: "heures", h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, "0") };
}

/** Durée d'une vente : 1800 -> « 1,8 » (virgule décimale). */
export function secondesAffichees(dureeMs: number): string {
  return (Math.round(dureeMs / 100) / 10).toFixed(1).replace(".", ",");
}

/** Numéro saisi (9 chiffres camerounais, avec ou sans +237) -> « +237677301145 », ou null s'il est incomplet. */
export function telephoneDeSaisie(saisie: string): string | null {
  const chiffres = saisie.replace(/\D/g, "").replace(/^237(?=\d{9}$)/, "");
  return /^\d{9}$/.test(chiffres) ? `+237${chiffres}` : null;
}

/** « +237677301145 » -> « 6 77 30 11 45 ». */
export function telephoneAffiche(telephone: string): string {
  const national = telephone.replace(/^\+237/, "");
  return national.replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");
}
