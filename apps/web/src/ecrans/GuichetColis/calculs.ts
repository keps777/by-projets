import { primeAssurance } from "@afrimove/domain";

/** « 25000 » -> « 25 000 » (espaces ordinaires, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** « 2027-01-05T08:15:00.000+01:00 » -> « 08:15 » (les heures du contrat sont déjà à l'heure de Douala). */
export function heureDouala(iso: string): string {
  return iso.slice(11, 16);
}

/** 2 -> « 2 kg », 2.5 -> « 2,5 kg ». */
export function formaterPoids(kg: number): string {
  return `${String(kg).replace(".", ",")} kg`;
}

/** « 2 kg », « 2,5 », « 2.5kg » -> 2 / 2.5 ; null si ce n'est pas un poids positif. */
export function lirePoids(texte: string): number | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*(?:kg)?$/i.exec(texte.trim());
  if (!m?.[1]) return null;
  const kg = Number(m[1].replace(",", "."));
  return kg > 0 ? kg : null;
}

/** « 25 000 », « 25000 », « 25 000 F » -> 25000 ; null si ce n'est pas un montant entier. */
export function lireMontant(texte: string): number | null {
  const m = /^(\d[\d\s  ]*)\s*(?:F|FCFA)?$/i.exec(texte.trim());
  if (!m?.[1]) return null;
  return Number(m[1].replace(/[\s  ]/g, ""));
}

export interface Contact {
  nom: string;
  telephone: string;
}

/** « +237691221008 » -> « 6 91 22 10 08 » ; un numéro étranger reste tel quel. */
export function formaterTelephone(telephone: string): string {
  const m = /^\+237(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(telephone);
  return m ? m.slice(1).join(" ") : telephone;
}

/** { Ngo Aïcha, +237691221008 } -> « Ngo Aïcha · 6 91 22 10 08 ». */
export function formaterContact(contact: Contact): string {
  return `${contact.nom} · ${formaterTelephone(contact.telephone)}`;
}

/** « Ngo Aïcha · 6 91 22 10 08 » -> { nom, telephone: « +237691221008 » } ; null si le nom ou le numéro manque. */
export function lireContact(texte: string): Contact | null {
  const m = /^(.*\S)\s*·\s*(\+?[\d\s.()-]+)$/.exec(texte.trim());
  if (!m?.[1] || !m[2]) return null;
  const chiffres = m[2].replace(/[\s.()-]/g, "");
  if (chiffres.startsWith("+")) {
    return /^\+\d{8,15}$/.test(chiffres) ? { nom: m[1], telephone: chiffres } : null;
  }
  const national = chiffres.startsWith("237") ? chiffres.slice(3) : chiffres;
  return /^\d{9}$/.test(national) ? { nom: m[1], telephone: `+237${national}` } : null;
}

/** « Ngo Thérèse · 6 99 40 18 22 » -> « Ngo Thérèse · ···· 18 22 » : seuls les quatre derniers chiffres sortent sur l'étiquette. */
export function destinataireMasque(texte: string): string {
  const [debut = "", ...reste] = texte.split("·");
  const chiffres = reste.join("").replace(/\D/g, "");
  const fin = chiffres.length >= 4 ? `${chiffres.slice(-4, -2)} ${chiffres.slice(-2)}` : "";
  return `${debut.trim()} · ···· ${fin}`.trimEnd();
}

export interface LigneDevis {
  code: string;
  montant: number;
}

/** Part du devis qui ne dépend pas de l'assurance (le port). */
export function portDuDevis(lignes: readonly LigneDevis[]): number {
  return lignes.filter((l) => l.code !== "assurance").reduce((s, l) => s + l.montant, 0);
}

/** Prime d'assurance de la valeur déclarée (règle du domaine) ; à défaut de valeur lisible, celle du devis. */
export function primeDe(valeur: number | null, lignes: readonly LigneDevis[]): number {
  if (valeur !== null && valeur > 0) return primeAssurance(valeur).prime;
  return lignes.find((l) => l.code === "assurance")?.montant ?? 0;
}

/** Trois lettres de repli pour une destination dont le code de gare n'est pas connu (« Yaoundé » -> « YAO »). */
export function codeApproche(destination: string): string {
  return destination
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase();
}
