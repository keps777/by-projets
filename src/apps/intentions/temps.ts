// Jours et durées de l'écran « intentions » : on réutilise les formats de la soute (même famille d'écrans).
export { decaler, fenetre, heure, instantJourCourt, instantJourMois, instantJourMoisAn, jourCourt, jourLong, jourMois, jourMoisAn, pluriel } from '../bagages/format.ts';
export { jourDe } from '../../data/store.svelte.ts';
/** « 47:12:36 » : compte à rebours en heures, minutes, secondes. */
export function horloge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
/** Phrase accessible du compte à rebours. */
export function horlogeAria(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)); return `Valide encore ${Math.floor(s / 3600)} heures ${Math.floor((s % 3600) / 60)} minutes ${s % 60} secondes`;
}
/** Jours entiers restants (arrondi au-dessus) : « 30 j ». */
export const joursRestants = (cible: number, maintenant: number): number => Math.max(0, Math.ceil((cible - maintenant) / 86_400_000));
