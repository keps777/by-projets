// Course moto ou taxi vers la gare : tarifs, durées, étapes du suivi simulé, marge avant le bus. Pur.
export type Mode = 'moto' | 'taxi';
export const MODES: Mode[] = ['moto', 'taxi'];
export const NOM_MODE: Record<Mode, string> = { moto: 'Moto', taxi: 'Taxi' };
/** Quartiers de prise en charge (distance jusqu'à la gare, en km). */
export const QUARTIERS: { nom: string; km: number }[] = [{ nom: 'Bastos', km: 7 }, { nom: 'Essos', km: 5 }, { nom: 'Nlongkak', km: 6 }, { nom: 'Biyem-Assi', km: 9 }, { nom: 'Mendong', km: 10 }];
const arrondi50 = (n: number) => Math.round(n / 50) * 50;
/** Moto : 100 F/km ; taxi : 250 F de prise en charge + 180 F/km. Bastos → Mvan : 700 F en moto (maquette), 1 500 F en taxi. */
export const prixCourse = (mode: Mode, km: number) => (mode === 'moto' ? arrondi50(100 * km) : arrondi50(250 + 180 * km));
/** Temps de trajet (min) : la moto passe partout, le taxi subit les embouteillages. */
export const trajetMin = (mode: Mode, km: number) => Math.round((mode === 'moto' ? 2 : 2.4) * km);
/** Attente avant l'arrivée du véhicule (min). */
export const attenteMin = (mode: Mode) => (mode === 'moto' ? 2 : 5);
export interface ConducteurCourse { nom: string; societe: string; note: number; courses: number; plaque: string; initiales: string }
export const CONDUCTEURS: Record<Mode, ConducteurCourse> = {
  moto: { nom: 'Jean-Baptiste', societe: 'Yango', note: 4.9, courses: 1240, plaque: 'LT 482 AB', initiales: 'JB' },
  taxi: { nom: 'Roger', societe: 'Taxi jaune', note: 4.8, courses: 3105, plaque: 'LT 215 CE', initiales: 'RO' }
};
export const MOYENS_COURSE = ['momo', 'cagnotte', 'especes'] as const;
export type MoyenCourse = (typeof MOYENS_COURSE)[number];
export const NOM_MOYEN: Record<MoyenCourse, string> = { momo: 'MoMo', cagnotte: 'Cagnotte AfriMove', especes: 'Espèces' };
export type EtapeCourse = 0 | 1 | 2 | 3;
export interface InfoEtape { titre: string; pill: string; ton: 'ok' | 'ac' | 'inf'; cta: string }
export const ETAPES: InfoEtape[] = [
  { titre: '{mode} en route', pill: 'arrive', ton: 'ok', cta: 'Voir mon billet de bus' }, { titre: '{mode} arrivée', pill: 'là', ton: 'ac', cta: 'Je suis montée' },
  { titre: 'Vers la gare', pill: 'en route', ton: 'inf', cta: 'Montrer mon billet au quai' }, { titre: 'Arrivée à la gare', pill: 'terminé', ton: 'ok', cta: 'Voir mon billet de bus' }
];
/** Marge (min) entre l'arrivée à la gare et le départ du bus ; négative = bus raté. */
export const marge = (departMs: number, nowMs: number, mode: Mode, km: number) => Math.round((departMs - nowMs) / 60_000) - attenteMin(mode) - trajetMin(mode, km);
/** Marge mini conseillée à la gare. */
export const MARGE_MINI = 10;
/** Heure recommandée de commande (ms) pour arriver 25 min avant le départ. */
export const heureRecommandee = (departMs: number, mode: Mode, km: number) => departMs - (25 + attenteMin(mode) + trajetMin(mode, km)) * 60_000;
