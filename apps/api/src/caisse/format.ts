import { createHash } from "node:crypto";

/** « 7 500 » ; le signe moins est un vrai « − » suivi d'une espace (« − 1 000 »), comme les maquettes. */
export function nombre(n: number): string {
  const signe = n < 0 ? "− " : "";
  return (
    signe +
    Math.abs(n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  );
}

/** « 7 500 F ». */
export function francs(n: number): string {
  return `${nombre(n)} F`;
}

/** « Joseph Mbarga » → « Joseph M. » ; un seul mot reste tel quel. */
export function nomAbrege(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  const [premier, ...reste] = mots;
  if (!premier) return "Inconnu";
  const dernier = reste[reste.length - 1];
  return dernier ? `${premier} ${dernier.charAt(0).toLocaleUpperCase("fr-FR")}.` : premier;
}

/** « Joseph Mbarga » → « JM » (3 lettres au plus). */
export function initiales(nom: string): string {
  const lettres = nom
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m.charAt(0).toLocaleUpperCase("fr-FR"))
    .join("");
  return lettres.slice(0, 3) || "?";
}

/** NNNN : le numéro d'un billet sur quatre chiffres (« 0171 »). */
export function sequence4(n: number): string {
  return String(n).padStart(4, "0");
}

/** UUID déterministe : rejouer le même effet du système écrit le même événement. */
export function uuidDeterministe(graine: string): string {
  const h = createHash("sha256").update(graine).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
