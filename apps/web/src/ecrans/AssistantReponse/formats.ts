/**
 * Formats de la réponse de l'assistant, comme la planche AssistantReponse.dc.html les écrit : « + 1,5 M », « − 0,4 M »
 * (gain par mois d'une simulation), « 1. » (numéro d'un point). Les montants de l'API sont des entiers de FCFA.
 */

function decimale(valeur: number): string {
  return String(valeur).replace(".", ",");
}

/**
 * Gain (ou perte) par mois d'une option simulée : `1500000` -> `+ 1,5 M`, `-400000` -> `− 0,4 M` (en millions dès
 * 100 000 : la planche écrit « − 0,4 M » et non « − 400 k »), `85000` -> `+ 85 k`, `950` -> `+ 950 F`. Le signe est
 * écrit avec une espace (vrai signe moins), deux décimales au plus en millions, une en milliers. Zéro : `0 F`.
 */
export function gainSimule(fcfa: number): string {
  if (fcfa === 0) return "0 F";
  const signe = fcfa < 0 ? "−" : "+";
  const absolu = Math.abs(fcfa);
  if (absolu >= 100_000) return `${signe} ${decimale(Math.round(absolu / 10_000) / 100)} M`;
  if (absolu >= 1000) return `${signe} ${decimale(Math.round(absolu / 100) / 10)} k`;
  return `${signe} ${Math.round(absolu)} F`;
}

export interface PointNumerote {
  /** « 1. » */
  numero: string;
  texte: string;
}

/**
 * Les points de l'explication. L'API les écrit déjà numérotés (« 1. Les deux mercredis… ») : le numéro est repris tel
 * quel et mis en avant ; un point sans numéro reçoit son rang.
 */
export function numeroter(points: readonly string[]): PointNumerote[] {
  return points.map((point, i) => {
    const m = /^(\d+\.)\s*(.*)$/s.exec(point);
    return m ? { numero: m[1]!, texte: m[2]! } : { numero: `${i + 1}.`, texte: point };
  });
}
