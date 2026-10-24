// Covoiturage : commission, gain du conducteur, validation d'une offre, places restantes. Pur.
import type { OffreCovoit } from '../domain/types.ts';
export const COMMISSION = 0.1;
export const PLACES_MIN = 1, PLACES_MAX = 4, PRIX_MIN = 2000, PRIX_MAX = 10000, PAS_PRIX = 500, OBJECTIF_GAIN = 20000;
/** Ce que touche le conducteur : prix des places moins la commission d'AfriMove. */
export const gainConducteur = (places: number, prix: number) => Math.round(places * prix * (1 - COMMISSION));
export const pourcentObjectif = (gain: number) => Math.min(100, Math.round((gain / OBJECTIF_GAIN) * 100));
export const placesReservees = (o: Pick<OffreCovoit, 'reservations'>) => o.reservations.reduce((s, r) => s + r.places, 0);
export const placesRestantes = (o: Pick<OffreCovoit, 'places' | 'reservations'>) => Math.max(0, o.places - placesReservees(o));
export const initiales = (prenom: string, nom = '') => `${prenom[0] ?? ''}${nom[0] ?? ''}`.toUpperCase();
/** « Samuel K. » */
export const nomCourt = (prenom: string, nom = '') => `${prenom}${nom ? ` ${nom[0]}.` : ''}`;
export interface SaisieOffre { de: string; vers: string; jour: string; heure: string; places: number; prix: number; vehicule: string }
/** Message d'erreur en français, ou null si l'offre est publiable. `nowMs` : maintenant. */
export function erreurOffre(s: SaisieOffre, nowMs: number): string | null {
  if (!s.de.trim() || !s.vers.trim()) return 'Indique le départ et l’arrivée.';
  if (s.de.trim() === s.vers.trim()) return 'Le départ et l’arrivée doivent être différents.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.heure)) return 'Heure invalide (format 07:30).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.jour)) return 'Choisis un jour.';
  if (new Date(`${s.jour}T${s.heure}:00`).getTime() < nowMs) return 'Ce départ est déjà passé.';
  if (!Number.isInteger(s.places) || s.places < PLACES_MIN || s.places > PLACES_MAX) return `Entre ${PLACES_MIN} et ${PLACES_MAX} places.`;
  if (s.prix < PRIX_MIN || s.prix > PRIX_MAX) return `Le prix par place va de ${PRIX_MIN.toLocaleString('fr-FR')} à ${PRIX_MAX.toLocaleString('fr-FR')} F.`;
  if (s.vehicule.trim().length < 2) return 'Indique ton véhicule (ex. Toyota Corolla).';
  return null;
}
const VEHICULES: Record<string, string> = { Corolla: 'Toyota Corolla', Picanto: 'Kia Picanto', Hilux: 'Toyota Hilux', Rav4: 'Toyota Rav4', Logan: 'Dacia Logan' };
/** Nom complet du véhicule (« Picanto » → « Kia Picanto »). */
export const nomVehicule = (v: string | undefined) => (v ? VEHICULES[v] ?? v : 'Véhicule');
/** Départ d'une offre en ms. */
export const departOffreMs = (o: Pick<OffreCovoit, 'jour' | 'heure'>) => new Date(`${o.jour}T${o.heure}:00`).getTime();
