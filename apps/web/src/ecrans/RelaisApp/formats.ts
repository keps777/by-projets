/** Un code de retrait complet a six chiffres. */
export const LONGUEUR_CODE = 6;

/** 8400 -> « 8 400 » (espace ordinaire, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 4.9 -> « 4,9 », 5 -> « 5,0 » : la note a toujours une décimale. */
export function formaterNote(note: number): string {
  return note.toFixed(1).replace(".", ",");
}

/** « 2027-01-05T13:30:00.000+01:00 » -> « 13:30 » (les heures du contrat sont déjà à l'heure de Douala). */
export function heureDouala(iso: string): string {
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m?.[1] ?? "";
}

/**
 * « C-DLA-270105-0017 » -> « C-…-0017 » : la planche abrège le numéro du colis (première et dernière parties). Un
 * numéro qui n'a pas ce format reste entier.
 */
export function numeroCourt(numero: string): string {
  const parties = numero.split("-");
  const premiere = parties[0];
  const derniere = parties[parties.length - 1];
  if (parties.length < 3 || premiere === undefined || derniere === undefined) return numero;
  return `${premiere}-…-${derniere}`;
}

/** 4 -> « 4 kg », 1.5 -> « 1,5 kg » (virgule décimale). */
export function formaterPoids(poidsKg: number): string {
  return `${String(poidsKg).replace(".", ",")} kg`;
}

/** Ne garde que les chiffres du code de retrait, six au plus. */
export function chiffresDuCode(texte: string): string {
  return texte.replace(/\D/g, "").slice(0, LONGUEUR_CODE);
}
