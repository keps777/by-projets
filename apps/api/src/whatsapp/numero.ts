/** `+237655012345` → `+237 ••••• 345` : de quoi reconnaître le numéro à l'écran sans l'exposer. */
export function masquerNumero(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, "");
  if (chiffres.length < 8) return "••••";
  const indicatif = chiffres.length > 9 ? chiffres.slice(0, chiffres.length - 9) : "";
  return `${indicatif ? `+${indicatif} ` : ""}••••• ${chiffres.slice(-3)}`;
}
