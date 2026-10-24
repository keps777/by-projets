// Estimation en route : avancement simulé d'un bus entre son départ et son arrivée, retard compris.
export const minutes = (heure: string) => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));
export const hhmm = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export interface Estimation { depart: string; arrivee: string; enRoute: boolean; termine: boolean; avancement: number; resteMin: number }
/** `nowMin` : minutes depuis minuit le jour du départ. */
export function estimer(heure: string, dureeMin: number, retardMin: number, nowMin: number): Estimation {
  const d = minutes(heure) + retardMin, a = d + dureeMin, avancement = Math.max(0, Math.min(1, (nowMin - d) / dureeMin));
  return { depart: hhmm(d), arrivee: hhmm(a), enRoute: nowMin >= d && nowMin < a, termine: nowMin >= a, avancement, resteMin: Math.max(0, a - nowMin) };
}
/** Geste commercial offert en cas de retard ≥ 30 min. */
export const gesteRetard = (retardMin: number) => (retardMin >= 30 ? 500 : 0);
