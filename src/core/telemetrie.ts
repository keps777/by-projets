// Télémétrie simulée des bus (vitesse, entretien, carburant) : tout est déterministe à partir de l'identifiant du bus ou du départ,
// pour que la salle de contrôle et la fiche d'un bus racontent la même histoire. Aucune donnée réelle de capteur.
import { ajouterJours, type Jour } from './dates.ts';
import { hash01 } from './analyses.ts';

export const LIMITE_VITESSE = 90;
const DISTANCES: Record<string, number> = { 'Yaoundé|Douala': 245, 'Yaoundé|Bafoussam': 290, 'Yaoundé|Bamenda': 370, 'Douala|Kribi': 150 };
export const distanceKm = (de: string, vers: string) => DISTANCES[`${de}|${vers}`] ?? DISTANCES[`${vers}|${de}`] ?? 200;

const ETAPES: Record<string, [string, number][]> = {
  'Yaoundé|Douala': [['Mbankomo', 0.1], ['Boumnyebel', 0.45], ['Edéa', 0.75], ['Yassa', 0.93]],
  'Yaoundé|Bafoussam': [['Obala', 0.15], ['Bafia', 0.35], ['Makénéné', 0.6], ['Bangangté', 0.85]],
  'Yaoundé|Bamenda': [['Obala', 0.1], ['Bafia', 0.25], ['Bafoussam', 0.7], ['Bamendjou', 0.85]],
  'Douala|Kribi': [['Edéa', 0.35], ['Lokoundjé', 0.75]]
};
/** Étapes dans le sens du trajet, la ville d'arrivée en dernier. */
export function etapesRoute(de: string, vers: string): { nom: string; f: number }[] {
  const direct = ETAPES[`${de}|${vers}`], inverse = ETAPES[`${vers}|${de}`];
  const e = direct ? direct.map(([nom, f]) => ({ nom, f })) : inverse ? [...inverse].reverse().map(([nom, f]) => ({ nom, f: 1 - f })) : [];
  return [...e, { nom: vers, f: 1 }];
}
/** Prochaine étape devant le bus et minutes restantes (durée du trajet × part de route restante). */
export function prochaineEtape(de: string, vers: string, avancement: number, dureeMin: number): { nom: string; minutes: number } | null {
  const e = etapesRoute(de, vers).find((x) => x.f > avancement);
  return e ? { nom: e.nom, minutes: Math.max(1, Math.round((e.f - avancement) * dureeMin)) } : null;
}

export interface PointVitesse { f: number; v: number }
/** Profil de vitesse d'un trajet (n points) : montée, croisière, descente. Les bus « pressés » (≈ 1 sur 8) dépassent la limite en 3 points. */
export function profilVitesse(departId: string, n = 14): PointVitesse[] {
  const presse = hash01(`${departId}|presse`) < 0.12, pics = new Set<number>();
  for (let k = 0; presse && pics.size < 3 && k < 40; k++) pics.add(2 + Math.floor(hash01(`${departId}|pic${k}`) * (n - 4)));
  return Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1), base = 22 + 52 * Math.sqrt(Math.sin(Math.PI * f)), v = base + (hash01(`${departId}|v${i}`) - 0.5) * 8 + (pics.has(i) ? 24 : 0);
    return { f, v: Math.round(Math.max(0, Math.min(110, v))) };
  });
}
export const excesVitesse = (profil: PointVitesse[]) => profil.filter((p) => p.v > LIMITE_VITESSE).length;
/** Vitesse instantanée à un point d'avancement du trajet (0 à 1). */
export function vitesseA(departId: string, avancement: number): number {
  const p = profilVitesse(departId); return p[Math.max(0, Math.min(p.length - 1, Math.round(avancement * (p.length - 1))))].v;
}

export interface ControleBus { libelle: string; etat: 'ok' | 'bientot'; jour: Jour }
export interface TelemetrieBus { annee: number; kmTotal: number; litresAux100: number; entretienJours: number; entretienLibelle: string; controles: ControleBus[] }
const ENTRETIENS = ['vidange + freins', 'vidange + plaquettes', 'pneus avant', 'révision complète'];
export function telemetrieBus(busId: string, aujourdhui: Jour): TelemetrieBus {
  return {
    annee: 2016 + Math.floor(hash01(`${busId}|an`) * 7), kmTotal: 120_000 + Math.floor(hash01(`${busId}|km`) * 280_000), litresAux100: Math.round((27 + hash01(`${busId}|l`) * 9) * 10) / 10,
    entretienJours: 3 + Math.floor(hash01(`${busId}|e`) * 30), entretienLibelle: ENTRETIENS[Math.floor(hash01(`${busId}|el`) * ENTRETIENS.length)],
    controles: [{ libelle: 'Pneus arrière', etat: 'ok', jour: ajouterJours(aujourdhui, -(5 + Math.floor(hash01(`${busId}|pn`) * 20))) },
      { libelle: 'Visite technique valable jusqu’au', etat: 'ok', jour: ajouterJours(aujourdhui, 120 + Math.floor(hash01(`${busId}|vt`) * 300)) },
      { libelle: 'Assurance jusqu’au', etat: 'ok', jour: ajouterJours(aujourdhui, 90 + Math.floor(hash01(`${busId}|as`) * 250)) }]
  };
}
