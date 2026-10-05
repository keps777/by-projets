// Délais de rappel d'une tâche : le rappel principal (« Me prévenir ») et des rappels plus tôt (2 h avant, la veille…).

export const MIN_HEURE = 60;
export const MIN_JOUR = 24 * 60;

/** Tous les délais d'une tâche, en minutes avant le début, sans doublon, du plus lointain au plus proche. */
export function delaisRappel(t: { rappel_min: number | null; rappels_avant_min?: readonly number[] | null }): number[] {
  const tous = [t.rappel_min, ...(t.rappels_avant_min ?? [])].filter((d): d is number => typeof d === 'number' && Number.isFinite(d) && d >= 0);
  return [...new Set(tous)].sort((a, b) => b - a);
}

/** « 10 min », « 2 h », « 1 jour », « 1 jour et 2 h », « 2 jours » : le délai écrit comme on le dit. */
export function libelleDelai(min: number): string {
  if (min <= 0) return 'à l’heure';
  const jours = Math.floor(min / MIN_JOUR), reste = min % MIN_JOUR;
  const h = Math.floor(reste / MIN_HEURE), m = reste % MIN_HEURE;
  const parties: string[] = [];
  if (jours) parties.push(`${jours} jour${jours > 1 ? 's' : ''}`);
  if (h) parties.push(`${h} h`);
  if (m) parties.push(`${m} min`);
  return parties.length > 1 ? `${parties.slice(0, -1).join(' ')} et ${parties[parties.length - 1]}` : parties[0];
}
