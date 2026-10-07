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

/** Alarme : après le rappel le plus proche du début, on insiste toutes les 2 min, 5 fois, tant que le bloc est « prévu ». */
export const ALARME_REPETITIONS = 5;
export const ALARME_INTERVALLE_MIN = 2;

export interface RappelPlanifie {
  /** Minutes avant le début (négatif : après le début). */
  delai: number;
  /** 0 pour un rappel normal, 1 à 5 pour une insistance d'alarme. */
  rang: number;
}

/** Tous les rappels d'une tâche, du plus tôt au plus tard : les délais choisis, puis (alarme) les insistances. */
export function rappelsPlanifies(t: { rappel_min: number | null; rappels_avant_min?: readonly number[] | null; alarme?: boolean | null }): RappelPlanifie[] {
  const normaux = delaisRappel(t);
  if (!t.alarme) return normaux.map((delai) => ({ delai, rang: 0 }));
  // Une alarme sans délai choisi sonne au début du bloc.
  const delais = normaux.length ? normaux : [0];
  const dernier = delais[delais.length - 1];
  return [
    ...delais.map((delai) => ({ delai, rang: 0 })),
    ...Array.from({ length: ALARME_REPETITIONS }, (_, i) => ({ delai: dernier - (i + 1) * ALARME_INTERVALLE_MIN, rang: i + 1 }))
  ];
}

/** Début de l'alarme dans l'app : l'instant du dernier rappel normal (en minutes avant le début), ou null sans alarme. */
export function delaiAlarme(t: { rappel_min: number | null; rappels_avant_min?: readonly number[] | null; alarme?: boolean | null }): number | null {
  if (!t.alarme) return null;
  const normaux = delaisRappel(t);
  return normaux.length ? normaux[normaux.length - 1] : 0;
}
