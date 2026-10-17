import type { DemandeRedaction, Redige } from "./ports";

/**
 * Le contrat entre l'API et le modèle de langage : ce qu'on lui demande, et ce qu'on accepte en retour.
 *
 * Les chiffres viennent des calculs de l'API ; le modèle ne fait que reformuler. Sa réponse n'est
 * gardée que si chaque nombre qu'elle contient figure déjà dans les faits donnés (ou dans la question) :
 * un chiffre inventé, arrondi ou recalculé par le modèle fait tomber sur le texte des règles.
 */

export const RESUME_MAXIMUM = 600;
export const POINT_MAXIMUM = 600;
export const POINTS_MAXIMUM_REDIGES = 6;

const NOMBRE = /\d+(?:[   ]\d{3})*(?:[.,]\d+)?/g;
const NUMERO_DE_POINT = /^\s*\d+\s*[.)]\s*/;

/** Les nombres d'un texte, sous une forme comparable : « 1 470 000 » et « 1470000 » sont le même. */
export function nombresDe(texte: string): string[] {
  const trouves = texte.match(NOMBRE) ?? [];
  return trouves.map((n) => String(Number(n.replace(/[   ]/g, "").replace(",", "."))));
}

export function sansNumero(point: string): string {
  return point.replace(NUMERO_DE_POINT, "").trim();
}

const estTexte = (v: unknown): v is string => typeof v === "string";

/**
 * Valide ce que le modèle a rendu. Rend `null` (et on retombe sur les règles) si :
 * - la forme n'est pas `{ resume: string, points: string[] }` ;
 * - un texte est vide ou trop long, contient une adresse web ou un marqueur de masquage ;
 * - des points sont rendus alors qu'il n'en faut pas, ou aucun alors qu'il en faut ;
 * - un nombre n'est ni dans les faits ni dans la question ;
 * - un texte obligatoire (le nom complet de la ligne) manque.
 * Les points sont renumérotés « 1. », « 2. »… par l'API.
 */
export function verifierRedaction(brut: unknown, demande: DemandeRedaction): Redige | null {
  if (typeof brut !== "object" || brut === null) return null;
  const { resume, points } = brut as { resume?: unknown; points?: unknown };
  if (!estTexte(resume)) return null;
  const lesPoints = points === undefined ? [] : points;
  if (!Array.isArray(lesPoints) || !lesPoints.every(estTexte)) return null;

  const resumeNet = resume.trim();
  const pointsNets = demande.avecPoints
    ? lesPoints.map(sansNumero).filter((p) => p.length > 0)
    : [];
  if (resumeNet.length === 0 || resumeNet.length > RESUME_MAXIMUM) return null;
  if (
    demande.avecPoints &&
    (pointsNets.length === 0 || pointsNets.length > POINTS_MAXIMUM_REDIGES)
  ) {
    return null;
  }
  if (pointsNets.some((p) => p.length > POINT_MAXIMUM)) return null;

  const tout = [resumeNet, ...pointsNets];
  if (tout.some((t) => /https?:\/\/|www\.|\[(numéro|adresse)\]/i.test(t))) return null;

  const permis = new Set([...demande.faits, demande.question].flatMap(nombresDe));
  for (const t of tout) {
    if (nombresDe(t).some((n) => !permis.has(n))) return null;
  }
  const ensemble = tout.join("\n");
  if (demande.motsObligatoires.some((m) => !ensemble.includes(m))) return null;

  return { resume: resumeNet, points: pointsNets.map((p, i) => `${i + 1}. ${p}`) };
}

/* ------------------------------------------------------------------ ce qu'on demande au modèle */

export const INSTRUCTIONS_REDACTION = [
  "Tu es l'assistant d'un patron de compagnie de bus au Cameroun. Tu écris en français simple, en tutoyant, avec des phrases courtes.",
  "On te donne une question et des faits déjà calculés par l'application.",
  "Règles strictes :",
  "- N'utilise que les faits fournis. N'invente aucune cause, aucun nom, aucun chiffre.",
  "- Chaque nombre de ta réponse doit être recopié tel quel depuis les faits, avec les mêmes unités. Ne calcule rien, n'arrondis rien, ne convertis rien (pas de « millions »).",
  "- Si les faits ne répondent pas à la question, dis-le simplement.",
  "- Garde mot pour mot le nom complet des lignes, par exemple « Douala → Bafoussam », et les pseudonymes comme « Agent 1 » ou « Chauffeur 2 ».",
  "- Ne cite jamais les chiffres d'une autre compagnie, seulement ce qui figure dans les faits.",
  '- Réponds uniquement par un objet JSON, sans texte autour : {"resume": "...", "points": ["..."]}.',
].join("\n");

export function consigneFormat(demande: DemandeRedaction): string {
  return demande.avecPoints
    ? "resume : une à trois phrases qui répondent. points : de 2 à 5 phrases qui expliquent, sans numéro (l'application les numérote)."
    : "resume : deux à quatre phrases qui répondent. points : tableau vide.";
}

export function messageRedaction(demande: DemandeRedaction): string {
  return [
    `Question : ${demande.question}`,
    "",
    "Faits :",
    ...demande.faits.map((f) => `- ${f}`),
    "",
    consigneFormat(demande),
  ].join("\n");
}

export const INSTRUCTIONS_INTERPRETATION = [
  "Tu classes la question d'un patron de compagnie de bus dans une catégorie. Tu ne réponds pas à la question.",
  "Catégories possibles pour « intention » :",
  "- pourquoi_ligne : pourquoi une ligne baisse ou va mal (nom de ligne obligatoire) ;",
  "- cout_bus : quel bus coûte le plus ;",
  "- prevision_jour : prévision d'un jour de la semaine (jourSemaine obligatoire) ;",
  "- et_si_prix : que se passe-t-il si le prix change (prix obligatoire) ;",
  "- ou_part_argent : où l'argent fuit, quels écarts ;",
  "- inconnue : rien de cela.",
  'Réponds uniquement par un objet JSON : {"intention": "...", "ligne": null, "heure": null, "jourSemaine": null, "prix": null}.',
  "ligne : un nom exactement comme dans la liste donnée, sinon null. heure : « HH:MM » ou null. jourSemaine : 0 (dimanche) à 6 (samedi) ou null. prix : un entier en francs CFA ou null.",
].join("\n");

export function messageInterpretation(question: string, lignes: readonly string[]): string {
  return [
    `Question : ${question}`,
    "",
    "Lignes de la compagnie :",
    ...lignes.map((l) => `- ${l}`),
  ].join("\n");
}
