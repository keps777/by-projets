import { nombre } from "../format";

/**
 * Lecture des planches HTML pour les tests : le texte qu'elles affichent, ses jetons numériques, et
 * les feuilles (chaînes, nombres) d'un scénario à comparer.
 */

const planchesBrutes = import.meta.glob("../../../../docs/maquettes-v3/*.dc.html", {
  query: "?raw",
  import: "default",
  eager: true,
});

export function htmlPlanche(nom: string): string {
  const cle = Object.keys(planchesBrutes).find((c) => c.endsWith(`/${nom}.dc.html`));
  if (!cle) throw new Error(`Planche introuvable : ${nom}`);
  return planchesBrutes[cle] as string;
}

export function nomsPlanchesHtml(): string[] {
  return Object.keys(planchesBrutes)
    .map((c) => c.split("/").pop()!.replace(".dc.html", ""))
    .sort();
}

const ENTITES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decoder(texte: string): string {
  return texte.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (e) => ENTITES[e] ?? e);
}

export function compacter(texte: string): string {
  return texte.replace(/\s+/g, " ").trim();
}

export interface TextePlanche {
  /** Balises supprimées sans espace : « Départ Bonapriso, pharmacie ». */
  colle: string;
  /** Balises remplacées par une espace : « 08:00 Bêta Express ». */
  espace: string;
}

/** Texte visible d'une planche, attributs utiles (value, aria-label, placeholder, title) compris. */
export function textePlanche(html: string): TextePlanche {
  let h = html
    .replace(/<head>[\s\S]*?<\/head>/g, " ")
    .replace(/<helmet>[\s\S]*?<\/helmet>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const attributs: string[] = [];
  for (const m of h.matchAll(/\b(?:value|aria-label|placeholder|title)="([^"]*)"/g)) {
    attributs.push(m[1] ?? "");
  }
  h = h.replace(/<br\s*\/?>/g, " ");
  const sansBalises = (remplacement: string) =>
    compacter(decoder(h.replace(/<[^>]+>/g, remplacement) + " " + attributs.join(" ¦ ")));
  return { colle: sansBalises(""), espace: sansBalises(" ") };
}

export function contient(texte: TextePlanche, extrait: string): boolean {
  const e = compacter(extrait);
  return texte.colle.includes(e) || texte.espace.includes(e);
}

/* ------------------------------------------------------------------ jetons numériques */

const JETON = /\d+(?: \d{3})*(?:[.,:]\d+)*/g;

export function jetons(texte: string): string[] {
  return [...texte.matchAll(JETON)].map((m) => m[0]);
}

export function jetonsPlanche(texte: TextePlanche): Set<string> {
  // Seule la version « balises = espace » donne des jetons fiables : collées, deux éléments voisins
  // (« 07:10 » puis « 12 min ») formeraient un faux nombre.
  return new Set(jetons(texte.espace));
}

/** Un jeton compte pour la couverture quand il a au moins deux chiffres ou un séparateur. */
export function jetonSignificatif(jeton: string): boolean {
  return jeton.length >= 2;
}

/* ------------------------------------------------------------------ feuilles d'un scénario */

export type Feuille = { chemin: string; valeur: string | number };

export function feuilles(valeur: unknown, chemin = "donnees"): Feuille[] {
  if (typeof valeur === "string" || typeof valeur === "number") return [{ chemin, valeur }];
  if (valeur === null || valeur === undefined || typeof valeur === "boolean") return [];
  if (Array.isArray(valeur)) return valeur.flatMap((v, i) => feuilles(v, `${chemin}[${i}]`));
  if (typeof valeur === "object") {
    // Les clés qui commencent par « _ » (références vers les entités) ne sont pas affichées.
    return Object.entries(valeur)
      .filter(([k]) => !k.startsWith("_"))
      .flatMap(([k, v]) => feuilles(v, `${chemin}.${k}`));
  }
  return [];
}

/** Les écritures possibles d'un nombre sur une planche : 7500 → « 7500 » et « 7 500 ». */
export function ecrituresNombre(n: number): string[] {
  const a = Math.abs(n);
  return [String(a), nombre(a)];
}

/* ------------------------------------------------------------------ rapport de relecture */

/** Segments de texte distincts d'une planche (un par balise), attributs utiles compris. */
export function segmentsPlanche(html: string): string[] {
  let h = html
    .replace(/<head>[\s\S]*?<\/head>/g, " ")
    .replace(/<helmet>[\s\S]*?<\/helmet>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const attributs: string[] = [];
  for (const m of h.matchAll(/\b(?:value|aria-label|placeholder|title)="([^"]*)"/g)) {
    attributs.push(m[1] ?? "");
  }
  h = h.replace(/<[^>]+>/g, "\n");
  const brut = decoder(h).split("\n").concat(attributs.map(decoder));
  const vus = new Set<string>();
  for (const segment of brut) {
    const s = compacter(segment);
    if (/[\p{L}\p{N}]/u.test(s)) vus.add(s);
  }
  return [...vus];
}
