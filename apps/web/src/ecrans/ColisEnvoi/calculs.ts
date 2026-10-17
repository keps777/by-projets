import { primeAssurance } from "@afrimove/domain";

/** Une valeur déclarée s'écrit avec neuf chiffres au plus : au-delà, ce n'est plus un colis. */
const CHIFFRES_MAX = 9;

/** « 25000 » -> « 25 000 » (espaces ordinaires, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** « 25 000 », « 25000 », « 25 000 F » -> 25000 ; null si ce n'est pas un montant entier. */
export function lireMontant(texte: string): number | null {
  const m = /^(\d[\d\s  ]*)\s*(?:F|FCFA)?$/i.exec(texte.trim());
  if (!m?.[1]) return null;
  const chiffres = m[1].replace(/[\s  ]/g, "");
  return chiffres.length <= CHIFFRES_MAX ? Number(chiffres) : null;
}

/** Saisie de la valeur : ne garde que les chiffres et les regroupe par trois (« 2500 » -> « 2 500 »). */
export function saisirMontant(texte: string): string {
  const chiffres = texte
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, CHIFFRES_MAX);
  return chiffres === "" ? "" : formaterMontant(Number(chiffres));
}

/** « 2027-01-05T08:15:00.000+01:00 » -> « 08:15 » (les heures du contrat sont déjà à l'heure de Douala). */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** « …T13:00… » -> « 13 h », « …T13:30… » -> « 13 h 30 » (heure d'arrivée de la planche). */
export function heureCourte(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m?.[1] || !m[2]) return "";
  const heures = Number(m[1]);
  return m[2] === "00" ? `${heures} h` : `${heures} h ${m[2]}`;
}

/** 2 -> « 2 », 2.5 -> « 2,5 » (virgule décimale ; l'unité « kg » est dans le texte). */
export function formaterPoids(kg: number): string {
  return String(kg).replace(".", ",");
}

/** « +237699401822 » -> « 6 99 40 18 22 » ; un numéro étranger reste tel quel. */
export function formaterTelephone(telephone: string): string {
  const m = /^\+237(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(telephone);
  return m ? m.slice(1).join(" ") : telephone;
}

export interface Contact {
  nom: string;
  telephone: string;
}

/** { Maman, +237699401822 } -> « Maman · 6 99 40 18 22 ». */
export function formaterContact(contact: Contact): string {
  return `${contact.nom} · ${formaterTelephone(contact.telephone)}`;
}

/** « Maman · 6 99 40 18 22 » -> { nom, telephone: « +237699401822 » } ; null si le nom ou le numéro manque. */
export function lireContact(texte: string): Contact | null {
  const m = /^(.*\S)\s*·\s*(\+?[\d\s.()-]+)$/.exec(texte.trim());
  if (!m?.[1] || !m[2]) return null;
  const nom = m[1].trim();
  const chiffres = m[2].replace(/[\s.()-]/g, "");
  if (chiffres.startsWith("+")) {
    return /^\+\d{8,15}$/.test(chiffres) ? { nom, telephone: chiffres } : null;
  }
  const national =
    chiffres.startsWith("237") && chiffres.length === 12 ? chiffres.slice(3) : chiffres;
  return /^\d{9}$/.test(national) ? { nom, telephone: `+237${national}` } : null;
}

/** « Bafoussam · gare Alpha » -> « Bafoussam » : la ville sert à chercher les départs. */
export function villeDe(ou: string): string {
  return (ou.split("·")[0] ?? "").trim();
}

/** { Bafoussam, gare Alpha } -> « Bafoussam · gare Alpha » ; sans gare, la ville seule. */
export function formaterDestination(destination: { ville: string; gare: string }): string {
  return destination.gare ? `${destination.ville} · ${destination.gare}` : destination.ville;
}

/** Valeur assurée et prime pour une valeur déclarée (règle du domaine : 2 %, minimum 500 F, plafond) ; null sans valeur. */
export function assuranceDe(
  valeur: number | null,
): { valeurAssuree: number; prime: number } | null {
  if (valeur === null || valeur <= 0) return null;
  return primeAssurance(valeur);
}

export interface LigneDevis {
  code: string;
  libelle: string;
  montant: number;
}

/**
 * « 1 500 port + 200 frais + 500 assurance » : chaque ligne du devis, dans l'ordre du devis. `mots` donne le mot de
 * chaque code ; une ligne inconnue garde son libellé en minuscules.
 */
export function detailDuPrix(
  lignes: readonly LigneDevis[],
  mots: Readonly<Record<string, string>>,
): string {
  return lignes
    .map(
      (ligne) =>
        `${formaterMontant(ligne.montant)} ${mots[ligne.code] ?? ligne.libelle.toLowerCase()}`,
    )
    .join(" + ");
}
