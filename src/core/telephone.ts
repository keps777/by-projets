// Numéros de téléphone camerounais : saisie libre → numéro national à 9 chiffres (6XXXXXXXX), formats d'affichage.
/** « +237 6 91 22 10 08 », « 691 22 10 08 », « 691221008 »… → « 691221008 », ou null si ce n'est pas un mobile camerounais (9 chiffres, 6[2-9]…). */
export function normaliserTel(saisie: string): string | null {
  let c = saisie.replace(/[^\d+]/g, '');
  if (c.startsWith('+237')) c = c.slice(4); else if (c.startsWith('00237')) c = c.slice(5); else if (c.startsWith('237') && c.length === 12) c = c.slice(3);
  c = c.replace(/\D/g, '');
  return /^6[2-9]\d{7}$/.test(c) ? c : null;
}
/** « 691221008 » → « 6 91 22 10 08 » (le format des maquettes). Une saisie non normalisable est rendue telle quelle. */
export function formaterTel(tel: string): string {
  const n = normaliserTel(tel); if (!n) return tel;
  return `${n[0]} ${n.slice(1, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
}
export const telInternational = (tel: string) => `+237 ${formaterTel(tel)}`;
/** Mise en forme au fil de la frappe : « 69122 » → « 6 91 22 ». Ignore le préfixe +237. */
export function formaterSaisie(saisie: string): string {
  let c = saisie.replace(/\D/g, '');
  if (saisie.trim().startsWith('+') && c.startsWith('237')) c = c.slice(3);
  c = c.slice(0, 9);
  const parts = [c.slice(0, 1), c.slice(1, 3), c.slice(3, 5), c.slice(5, 7), c.slice(7, 9)].filter(Boolean);
  return parts.join(' ');
}
