/**
 * Numéros camerounais saisis dans le champ de l'écran de connexion. L'indicatif +237 est affiché à part : le champ
 * ne contient que le numéro national, 9 chiffres commençant par 6 (téléphone mobile), écrit « 6 91 22 10 08 ».
 */

export const INDICATIF = "+237";
export const LONGUEUR_NUMERO = 9;

/** Chiffres du numéro national : retire l'espacement, le « + », l'indicatif 237 collé en entier et ce qui dépasse 9 chiffres. */
export function chiffresNational(saisie: string): string {
  let chiffres = saisie.replace(/\D/g, "");
  // « +237 6 91… », « 00237 6 91… » ou « 237691… » collés : l'indicatif n'est retiré que devant un numéro complet.
  if (chiffres.startsWith("00237") && chiffres.length >= 5 + LONGUEUR_NUMERO) {
    chiffres = chiffres.slice(5);
  } else if (chiffres.startsWith("237") && chiffres.length >= 3 + LONGUEUR_NUMERO) {
    chiffres = chiffres.slice(3);
  }
  return chiffres.slice(0, LONGUEUR_NUMERO);
}

/** « 691221008 » -> « 6 91 22 10 08 » (un chiffre, puis des paires), au fil de la saisie. */
export function formaterNational(chiffres: string): string {
  const groupes: string[] = [];
  if (chiffres.length > 0) groupes.push(chiffres.slice(0, 1));
  for (let i = 1; i < chiffres.length; i += 2) groupes.push(chiffres.slice(i, i + 2));
  return groupes.join(" ");
}

export function numeroValide(chiffres: string): boolean {
  return /^6\d{8}$/.test(chiffres);
}

/** Format du contrat d'API : « +237691221008 ». */
export function versInternational(chiffres: string): string {
  return `${INDICATIF}${chiffres}`;
}

/** Secondes -> « 0:42 ». */
export function formaterDelai(secondes: number): string {
  const s = Math.max(0, Math.ceil(secondes));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
