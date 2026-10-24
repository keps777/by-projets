// Retard : choix du meilleur départ de remplacement (même ligne, places libres, à l'heure). Pur.
export interface Candidat { id: string; departMs: number; places: number; compagnieId: string }
/** Le départ le plus proche de la nouvelle heure du bus retardé, au moins 20 min après `nowMs` ; à égalité, une autre compagnie. */
export function meilleureAlternative(cibleMs: number, compagnieId: string, candidats: Candidat[], nowMs: number): Candidat | undefined {
  const ok = candidats.filter((c) => c.places > 0 && c.departMs >= nowMs + 20 * 60_000);
  return [...ok].sort((a, b) => Math.abs(a.departMs - cibleMs) - Math.abs(b.departMs - cibleMs) || Number(a.compagnieId === compagnieId) - Number(b.compagnieId === compagnieId))[0];
}
