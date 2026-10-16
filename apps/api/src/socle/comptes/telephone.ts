/**
 * Numéros de téléphone : on les range toujours sous la forme internationale `+<indicatif><numéro>`
 * (chiffres seulement). Un numéro camerounais à 9 chiffres (6xx, 2xx) reçoit l'indicatif +237.
 */

export class TelephoneInvalide extends Error {
  constructor() {
    super("Numéro de téléphone invalide");
    this.name = "TelephoneInvalide";
  }
}

const INDICATIF_PAR_DEFAUT = "237";

export function normaliserTelephone(brut: string): string {
  const net = brut.replace(/[\s.\-()]/g, "");
  let chiffres: string;
  if (/^\+\d+$/.test(net)) chiffres = net.slice(1);
  else if (/^00\d+$/.test(net)) chiffres = net.slice(2);
  else if (/^\d{9}$/.test(net)) chiffres = INDICATIF_PAR_DEFAUT + net;
  else throw new TelephoneInvalide();
  if (!/^[1-9]\d{7,14}$/.test(chiffres)) throw new TelephoneInvalide();
  return `+${chiffres}`;
}

export function estTelephoneValide(brut: string): boolean {
  try {
    normaliserTelephone(brut);
    return true;
  } catch {
    return false;
  }
}
